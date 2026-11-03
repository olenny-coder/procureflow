// ProcureFlow workflow-engine bootstrap.
//
// This command is part of the locally reworked Temporal distribution under
// third_party/temporal. It is NOT imported by the app; the app only talks to
// Temporal over gRPC.
//
// Responsibilities:
//   - wait for the reworked Temporal server to become healthy;
//   - create the ProcureFlow namespace if it does not exist;
//   - idempotently register the ProcureFlow custom search attributes.
//
// Keeping this in a small command (instead of patching server internals) means
// the same upstream server binary can still be replaced by Temporal Cloud or a
// stock release without changing the application.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	enumspb "go.temporal.io/api/enums/v1"
	operatorservice "go.temporal.io/api/operatorservice/v1"
	"go.temporal.io/api/serviceerror"
	workflowservice "go.temporal.io/api/workflowservice/v1"
	"go.temporal.io/sdk/client"
	"google.golang.org/protobuf/types/known/durationpb"
)

const (
	defaultAddress   = "127.0.0.1:7233"
	defaultNamespace = "default"
)

func env(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

// envWithFallback accepts the neutral name first and a legacy name second, so
// deployments can migrate without a coordinated environment change.
func envWithFallback(primary, legacy, fallback string) string {
	if value := env(primary, ""); value != "" {
		return value
	}
	if value := env(legacy, ""); value != "" {
		return value
	}
	return fallback
}

func logEvent(level, msg string, fields map[string]any) {
	parts := make([]string, 0, len(fields)+3)
	parts = append(parts, fmt.Sprintf(`"level":%q`, level))
	parts = append(parts, fmt.Sprintf(`"msg":%q`, msg))
	parts = append(parts, fmt.Sprintf(`"service":"procureflow-engine-bootstrap"`))
	for key, value := range fields {
		switch typed := value.(type) {
		case string:
			parts = append(parts, fmt.Sprintf("%q:%q", key, typed))
		case bool:
			parts = append(parts, fmt.Sprintf("%q:%t", key, typed))
		case int:
			parts = append(parts, fmt.Sprintf("%q:%d", key, typed))
		default:
			parts = append(parts, fmt.Sprintf("%q:%q", key, fmt.Sprint(typed)))
		}
	}
	fmt.Printf("{%s}\n", strings.Join(parts, ","))
}

func fail(msg string, err error) {
	logEvent("error", msg, map[string]any{"error": err.Error()})
	os.Exit(1)
}

func main() {
	address := envWithFallback("WORKFLOW_ENGINE_ADDRESS", "TEMPORAL_ADDRESS", defaultAddress)
	namespace := envWithFallback("WORKFLOW_ENGINE_NAMESPACE", "TEMPORAL_NAMESPACE", defaultNamespace)
	waitSeconds := 120
	if raw := envWithFallback("WORKFLOW_ENGINE_BOOTSTRAP_WAIT_SECONDS", "TEMPORAL_BOOTSTRAP_WAIT_SECONDS", ""); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			waitSeconds = parsed
		}
	}

	attributeNames := strings.Split(
		envWithFallback(
			"WORKFLOW_ENGINE_BOOTSTRAP_SEARCH_ATTRIBUTES",
			"TEMPORAL_BOOTSTRAP_SEARCH_ATTRIBUTES",
			"ProcureFlowDepartment,ProcureFlowRisk,ProcureFlowStatus",
		),
		",",
	)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(waitSeconds)*time.Second)
	defer cancel()

	var engineClient client.Client
	var dialErr error
	for {
		engineClient, dialErr = client.DialContext(ctx, client.Options{
			HostPort:  address,
			Namespace: namespace,
		})
		if dialErr == nil {
			break
		}
		if ctx.Err() != nil {
			fail("engine_bootstrap_dial_timeout", fmt.Errorf("could not connect to %s: %w", address, dialErr))
		}
		time.Sleep(time.Second)
	}
	defer engineClient.Close()

	if _, err := engineClient.CheckHealth(ctx, &client.CheckHealthRequest{}); err != nil {
		fail("engine_bootstrap_health_failed", err)
	}
	logEvent("info", "engine_bootstrap_connected", map[string]any{"address": address, "namespace": namespace})

	if err := ensureNamespace(ctx, engineClient, namespace); err != nil {
		fail("engine_bootstrap_namespace_failed", err)
	}
	if err := waitForNamespace(ctx, engineClient, namespace); err != nil {
		fail("engine_bootstrap_namespace_not_ready", err)
	}

	ensured := 0
	for _, rawName := range attributeNames {
		name := strings.TrimSpace(rawName)
		if name == "" {
			continue
		}
		_, err := engineClient.OperatorService().AddSearchAttributes(ctx, &operatorservice.AddSearchAttributesRequest{
			Namespace: namespace,
			SearchAttributes: map[string]enumspb.IndexedValueType{
				name: enumspb.INDEXED_VALUE_TYPE_KEYWORD,
			},
		})
		if err != nil {
			var alreadyExists *serviceerror.AlreadyExists
			if errors.As(err, &alreadyExists) {
				logEvent("info", "engine_bootstrap_search_attribute_exists", map[string]any{"attribute": name})
				continue
			}
			fail("engine_bootstrap_search_attribute_failed", fmt.Errorf("%s: %w", name, err))
		}
		ensured++
		logEvent("info", "engine_bootstrap_search_attribute_ready", map[string]any{"attribute": name})
	}

	logEvent("info", "engine_bootstrap_complete", map[string]any{
		"address":                 address,
		"namespace":               namespace,
		"searchAttributesEnsured": ensured,
	})
}

func ensureNamespace(ctx context.Context, engineClient client.Client, namespace string) error {
	_, err := engineClient.WorkflowService().DescribeNamespace(ctx, &workflowservice.DescribeNamespaceRequest{
		Namespace: namespace,
	})
	if err == nil {
		logEvent("info", "engine_bootstrap_namespace_exists", map[string]any{"namespace": namespace})
		return nil
	}

	var notFound *serviceerror.NamespaceNotFound
	if !errors.As(err, &notFound) {
		return fmt.Errorf("describe namespace: %w", err)
	}

	_, err = engineClient.WorkflowService().RegisterNamespace(ctx, &workflowservice.RegisterNamespaceRequest{
		Namespace:                        namespace,
		WorkflowExecutionRetentionPeriod: durationpb.New(7 * 24 * time.Hour),
	})
	if err != nil {
		var alreadyExists *serviceerror.NamespaceAlreadyExists
		if errors.As(err, &alreadyExists) {
			return nil
		}
		return fmt.Errorf("register namespace: %w", err)
	}
	logEvent("info", "engine_bootstrap_namespace_created", map[string]any{"namespace": namespace})
	return nil
}

// waitForNamespace closes the small window between RegisterNamespace and the
// namespace becoming visible to the operator/frontend caches used by
// AddSearchAttributes. Without this, a fresh local database can fail with
// "Namespace ... is not found" immediately after creation.
func waitForNamespace(ctx context.Context, engineClient client.Client, namespace string) error {
	deadline := time.Now().Add(30 * time.Second)
	for {
		_, err := engineClient.WorkflowService().DescribeNamespace(ctx, &workflowservice.DescribeNamespaceRequest{
			Namespace: namespace,
		})
		if err == nil {
			logEvent("info", "engine_bootstrap_namespace_ready", map[string]any{"namespace": namespace})
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("namespace %s did not become ready: %w", namespace, err)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}
