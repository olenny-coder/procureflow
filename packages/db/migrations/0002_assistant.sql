CREATE TABLE "assistant_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "state" text NOT NULL DEFAULT 'COLLECTING',
  "pending_slot" text,
  "routing_path" text,
  "request_id" uuid REFERENCES "purchase_requests"("id") ON DELETE SET NULL,
  "model_name" text NOT NULL,
  "model_quantization" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assistant_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
  "turn_index" integer NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "visible_tools" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tool_calls" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "confidence" double precision,
  "band" text,
  "model_name" text,
  "model_quantization" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_turns_conversation_turn_unique" UNIQUE("conversation_id", "turn_index")
);
--> statement-breakpoint
CREATE TABLE "assistant_slot_values" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
  "slot_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "value" jsonb,
  "source_turn_id" uuid REFERENCES "assistant_turns"("id") ON DELETE SET NULL,
  "confidence" double precision,
  "band" text,
  "guardrail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "confirmed_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "assistant_slot_conversation_slot_unique" UNIQUE("conversation_id", "slot_key")
);
--> statement-breakpoint
CREATE TABLE "assistant_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "assistant_conversations"("id") ON DELETE CASCADE,
  "requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "turn_id" uuid REFERENCES "assistant_turns"("id") ON DELETE SET NULL,
  "slot_key" text,
  "kind" text NOT NULL DEFAULT 'SLOT',
  "proposed_value" jsonb NOT NULL,
  "source_snippet" text NOT NULL DEFAULT '',
  "confidence" double precision,
  "band" text,
  "escalation_reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "assigned_role" text NOT NULL,
  "reviewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "final_value" jsonb,
  "decision_note" text,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assistant_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "turn_id" uuid,
  "actor_id" uuid,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "model_name" text,
  "model_quantization" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "assistant_conversations_requester_idx" ON "assistant_conversations" ("requester_id");
--> statement-breakpoint
CREATE INDEX "assistant_turns_conversation_idx" ON "assistant_turns" ("conversation_id", "turn_index");
--> statement-breakpoint
CREATE INDEX "assistant_reviews_status_idx" ON "assistant_reviews" ("status", "assigned_role");
--> statement-breakpoint
CREATE INDEX "assistant_reviews_conversation_idx" ON "assistant_reviews" ("conversation_id");
--> statement-breakpoint
CREATE INDEX "assistant_audit_conversation_idx" ON "assistant_audit_events" ("conversation_id", "created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_assistant_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'assistant_audit_events is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER assistant_audit_events_append_only
BEFORE UPDATE OR DELETE ON "assistant_audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_assistant_audit_mutation();
