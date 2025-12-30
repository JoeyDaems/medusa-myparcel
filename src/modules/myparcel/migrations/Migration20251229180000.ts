import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251229180000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "myparcel_setting" add column if not exists "use_delivery_date" integer null default 0;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "myparcel_setting" drop column if exists "use_delivery_date";`);
  }

}
