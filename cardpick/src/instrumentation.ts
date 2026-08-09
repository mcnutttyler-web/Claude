export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureMigrated } = await import("./db/migrate");
    ensureMigrated();
  }
}
