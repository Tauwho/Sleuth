/**
 * Weekly free-tier usage report for sleuth-prod (N9, `.github/workflows/usage-watch.yml`).
 * Read-only queries through the worker's driver (`createDb`, one connection). Prints numbers and
 * percentages only: no ids, names, paths or row content.
 *
 * Fails (exit 1) when stored video files use more than 70% of the 1 GB Free storage, or the
 * database more than 70% of its 500 MB, so someone looks before uploads start failing.
 *
 *   $env:DATABASE_URL = Read-Host "Session pooler URL"; pnpm tsx scripts/usage-watch.ts
 */
import { createDb } from "@sleuth/db";
import { categoryOf } from "./keep-alive";

export const STORAGE_LIMIT_BYTES = 1024 ** 3; // Supabase Free: 1 GB file storage
export const DATABASE_LIMIT_BYTES = 500 * 1024 ** 2; // Supabase Free: 500 MB database
export const WARN_AT = 0.7;

export interface Usage {
  storageBytes: number;
  storageFiles: number;
  databaseBytes: number;
  guestProjects: number;
  teamProjects: number;
  analysesLast7Days: number;
}

const mb = (bytes: number) => (bytes / 1024 ** 2).toFixed(1);
const pct = (part: number, whole: number) => ((100 * part) / whole).toFixed(1);

/** The report lines and whether any limit is over the warning level. */
export function report(u: Usage): { lines: string[]; over: boolean } {
  const storageShare = u.storageBytes / STORAGE_LIMIT_BYTES;
  const dbShare = u.databaseBytes / DATABASE_LIMIT_BYTES;
  const over = storageShare > WARN_AT || dbShare > WARN_AT;
  return {
    over,
    lines: [
      `storage: ${mb(u.storageBytes)} MB of 1024 MB (${pct(u.storageBytes, STORAGE_LIMIT_BYTES)}%) in ${u.storageFiles} files`,
      `database: ${mb(u.databaseBytes)} MB of 500 MB (${pct(u.databaseBytes, DATABASE_LIMIT_BYTES)}%)`,
      `projects: ${u.guestProjects} guest, ${u.teamProjects} signed-up (demo not counted)`,
      `analyses in the last 7 days: ${u.analysesLast7Days}`,
      over
        ? `OVER ${Math.round(WARN_AT * 100)}%: check docs/deploy-plan.md "Abuse guards" and clean up old files`
        : `under ${Math.round(WARN_AT * 100)}% of both limits`,
    ],
  };
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.log("error config");
    return 1;
  }
  const handle = createDb(url, { max: 1 });
  const sql = handle.client;
  try {
    const [storage] = await sql`
      select count(*)::int as files, coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes
      from storage.objects where bucket_id = 'video-assets'`;
    const [db] = await sql`select pg_database_size(current_database())::bigint as bytes`;
    const [projects] = await sql`
      select
        count(*) filter (where u.is_anonymous)::int as guest,
        count(*) filter (where not coalesce(u.is_anonymous, false))::int as team
      from projects p left join auth.users u on u.id::text = p.owner_id
      where not p.is_demo`;
    const [analyses] = await sql`
      select count(*)::int as n from audit_events
      where type = 'analysis_requested' and created_at >= (now() - interval '7 days')::text`;
    const { lines, over } = report({
      storageBytes: Number(storage?.bytes ?? 0),
      storageFiles: Number(storage?.files ?? 0),
      databaseBytes: Number(db?.bytes ?? 0),
      guestProjects: Number(projects?.guest ?? 0),
      teamProjects: Number(projects?.team ?? 0),
      analysesLast7Days: Number(analyses?.n ?? 0),
    });
    for (const line of lines) console.log(line);
    return over ? 1 : 0;
  } catch (error) {
    console.log(`error ${categoryOf(error)}`);
    return 1;
  } finally {
    await sql.end({ timeout: 2 }).catch(() => undefined);
  }
}

if (process.argv[1] && /usage-watch\.ts$/.test(process.argv[1])) {
  void main().then((code) => process.exit(code));
}
