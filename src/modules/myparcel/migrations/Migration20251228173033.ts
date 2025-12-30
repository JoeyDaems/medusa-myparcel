import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251228173033 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "myparcel_consignment" drop constraint if exists "myparcel_consignment_order_id_unique";`);
    this.addSql(`create table if not exists "myparcel_consignment" ("id" text not null, "order_id" text not null, "fulfillment_id" text null, "carrier" text null, "myparcel_id" text null, "reference" text null, "status" text null, "barcode" text null, "track_trace_url" text null, "track_trace_status" text null, "label_format" text null, "label_position" integer null, "options_json" jsonb null, "recipient_snapshot_json" jsonb null, "track_trace_history_json" jsonb null, "errors_json" jsonb null, "last_synced_at" timestamptz null, "return_label_sent_at" timestamptz null, "return_label_email_status" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "myparcel_consignment_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_myparcel_consignment_order_id_unique" ON "myparcel_consignment" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_myparcel_consignment_order_id" ON "myparcel_consignment" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_myparcel_consignment_myparcel_id" ON "myparcel_consignment" ("myparcel_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_myparcel_consignment_barcode" ON "myparcel_consignment" ("barcode") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_myparcel_consignment_deleted_at" ON "myparcel_consignment" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "myparcel_setting" ("id" text not null, "api_key_enc" text null, "api_key_last4" text null, "environment" text null, "default_carrier" text null, "allowed_carriers" jsonb null, "default_label_format" text null, "default_a4_position" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "myparcel_setting_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_myparcel_setting_deleted_at" ON "myparcel_setting" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "myparcel_consignment" cascade;`);

    this.addSql(`drop table if exists "myparcel_setting" cascade;`);
  }

}
