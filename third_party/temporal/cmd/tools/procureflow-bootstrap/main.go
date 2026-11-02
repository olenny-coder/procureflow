// ProcureFlow Temporal bootstrap.
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

func logEvent(level, msg string, fields map[string]any) {
	parts := make([]string, 0, len(fields)+3)
	parts = append(parts, fmt.Sprintf(`"level":%q`, level))
	parts = append(parts, fmt.Sprintf(`"msg":%q`, msg))
	parts = append(parts, fmt.Sprintf(`"service":"procureflow-temporal-bootstrap"`))
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
	address := env("TEMPORAL_ADDRESS", defaultAddress)
	namespace := env("TEMPORAL_NAMESPACE", defaultNamespace)
	waitSeconds := 120
	if raw := env("TEMPORAL_BOOTSTRAP_WAIT_SECONDS", ""); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			waitSeconds = parsed
		}
	}

	attributeNames := strings.Split(
		env("TEMPORAL_BOOTSTRAP_SEARCH_ATTRIBUTES", "ProcureFlowDepartment,ProcureFlowRisk,ProcureFlowStatus"),
		",",
	)

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(waitSeconds)*time.Second)
	defer cancel()

	var temporalClient client.Client
	var dialErr error
	for {
		temporalClient, dialErr = client.DialContext(ctx, client.Options{
			HostPort:  address,
			Namespace: namespace,
		})
		if dialErr == nil {
			break
		}
		if ctx.Err() != nil {
			fail("temporal_bootstrap_dial_timeout", fmt.Errorf("could not connect to %s: %w", address, dialErr))
		}
		time.Sleep(time.Second)
	}
	defer temporalClient.Close()

	if _, err := temporalClient.CheckHealth(ctx, &client.CheckHealthRequest{}); err != nil {
		fail("temporal_bootstrap_health_failed", err)
	}
	logEvent("info", "temporal_bootstrap_connected", map[string]any{"address": address, "namespace": namespace})

	if err := ensureNamespace(ctx, temporalClient, namespace); err != nil {
		fail("temporal_bootstrap_namespace_failed", err)
	}

	ensured := 0
	for _, rawName := range attributeNames {
		name := strings.TrimSpace(rawName)
		if name == "" {
			continue
		}
		_, err := temporalClient.OperatorService().AddSearchAttributes(ctx, &operatorservice.AddSearchAttributesRequest{
			Namespace: namespace,
			SearchAttributes: map[string]enumspb.IndexedValueType{
				name: enumspb.INDEXED_VALUE_TYPE_KEYWORD,
			},
		})
		if err != nil {
			var alreadyExists *serviceerror.AlreadyExists
			if errors.As(err, &alreadyExists) {
				logEvent("info", "temporal_bootstrap_search_attribute_exists", map[string]any{"attribute": name})
				continue
			}
			fail("temporal_bootstrap_search_attribute_failed", fmt.Errorf("%s: %w", name, err))
		}
		ensured++
		logEvent("info", "temporal_bootstrap_search_attribute_ready", map[string]any{"attribute": name})
	}

	logEvent("info", "temporal_bootstrap_complete", map[string]any{
		"address":                 address,
		"namespace":               namespace,
		"searchAttributesEnsured": ensured,
	})
}

func ensureNamespace(ctx context.Context, temporalClient client.Client, namespace string) error {
	_, err := temporalClient.WorkflowService().DescribeNamespace(ctx, &workflowservice.DescribeNamespaceRequest{
		Namespace: namespace,
	})
	if err == nil {
		logEvent("info", "temporal_bootstrap_namespace_exists", map[string]any{"namespace": namespace})
		return nil
	}

	var notFound *serviceerror.NamespaceNotFound
	if !errors.As(err, &notFound) {
		return fmt.Errorf("describe namespace: %w", err)
	}

	_, err = temporalClient.WorkflowService().RegisterNamespace(ctx, &workflowservice.RegisterNamespaceRequest{
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
	logEvent("info", "temporal_bootstrap_namespace_created", map[string]any{"namespace": namespace})
	return nil
}
