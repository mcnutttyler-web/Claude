# 12. Security and Privacy Checklist

Organized by control area, then mapped to the three launch gates: **before internal testing**, **before design-partner testing**, **before paid production use**. A control listed at an earlier gate must remain satisfied at every later gate too.

## 12.1 Checklist by control area

| Control | Before internal testing | Before design-partner testing | Before paid production |
|---|---|---|---|
| Authentication | Managed auth wired up, working sign-in/reset | Invitation flow hardened, no test/default credentials remain | Session expiry policy reviewed |
| Role-based access | Server-side role checks on all mutations | Every role's boundaries manually walked through | Automated authorization test suite in CI |
| Tenant isolation | RLS enabled on all tenant tables | Cross-org isolation test suite passing | Re-run isolation tests after every schema change (CI gate) |
| Encryption | TLS everywhere (default via Vercel/Supabase) | Confirm no plaintext secrets in logs | Confirm DB encryption at rest (Supabase default) documented |
| Secrets management | `.env.local` gitignored, no secrets in CLAUDE.md | Secrets scanned by pre-tool-use hook | Rotate any secret that touched a shared channel (e.g., pasted in Slack) before go-live |
| Secure webhooks | Twilio signature verification implemented | Verified against staging with real signed requests | Confirm signature check fails closed (rejects on any verification error, not just mismatch) |
| Signed, expiring driver links | Token issue/verify implemented | Tamper/expiry tests passing | Confirm token purpose-scoping (disclosure token can't hit standby-offer endpoint) |
| Rate limiting | Basic rate limit on webhook endpoint | Rate limit on driver mobile-web pages (prevent token brute-forcing) | Rate limit on auth endpoints (sign-in, reset) |
| Audit logging | `audit_logs` capturing key mutations | Coverage of all state-machine transitions and manual overrides confirmed | Audit log retention policy defined |
| PII (general) | Identify all PII fields (names, phones, addresses) | Access to PII restricted to roles that need it | Data-minimization review — confirm nothing unnecessary is collected |
| Phone numbers | Stored normalized (E.164), not logged in plaintext app logs | Confirm phone numbers aren't exposed in client-side bundles/URLs unnecessarily | Confirm phone numbers scrubbed from error-monitoring (Sentry) payloads |
| Driver documents (if collected) | Stored in private (non-public) storage bucket | Signed-URL access only, scoped to org | Retention/deletion policy defined and enforced |
| Data retention | N/A yet | Draft a retention policy (how long inbound/outbound messages, audit logs are kept) | Policy implemented, documented for customers |
| Backups | Supabase automated backups enabled | Confirm backup schedule matches acceptable data-loss window | **Restore test performed and documented** — an untested backup is not a backup |
| Restore testing | N/A yet | One test restore into a scratch project | Restore test repeated at least quarterly going forward |
| Dependency monitoring | `npm audit`/Dependabot enabled | Review and resolve high/critical findings | Recurring monitoring confirmed active (not a one-time check) |
| Error-message hygiene | No stack traces in user-facing responses | Generic errors on auth failures (no user enumeration) | Reviewed across all driver-facing pages specifically (these are unauthenticated, highest exposure) |
| Administrative access | Founder's own admin account uses a strong, unique password + MFA where available | Any additional internal users reviewed for least-privilege role | Access review process defined for adding/removing internal users |
| Production database access | Direct DB access limited to founder, via Supabase's access controls | No shared/generic DB credentials | Production credentials never used in local development |
| Messaging spend alerts and kill switch | Kill switch implemented (Task 6.4) | Spend alert threshold tested with a simulated spike | Kill switch drill performed — founder has actually exercised it once before go-live, not just trusted the code |
| Incident response | N/A yet | Informal plan: who to contact (Twilio/Supabase support), how to invoke kill switch | Written incident-response one-pager (see `13-pilot-plan.md` for the operational side) |

## 12.2 Gate summary

- **Before internal testing** (founder using the app alone, no real driver data): auth, RLS, basic secrets hygiene, basic audit logging, no PII-handling shortcuts even in test data.
- **Before design-partner testing** (real dispatcher, still no real driver SMS traffic or with a very small controlled set): tenant isolation fully tested, webhook/token security hardened, rate limiting on driver-facing surfaces, a documented (even if informal) data-retention and incident approach.
- **Before paid production use** (real drivers receiving real SMS, real money changing hands eventually): every item above closed, backup restore actually tested, kill switch actually exercised, dependency monitoring recurring, an incident-response one-pager written down.

## 12.3 Flag for legal/security/industry-expert review

- Worker-classification language and mechanics (§`07-messaging-design.md` §7.6) — employment/labor counsel, per jurisdiction sold into.
- Data retention and deletion policy, especially for driver phone numbers and any documents collected — privacy counsel, particularly if selling into a state/country with specific data-protection statutes.
- SMS consent language and opt-in/opt-out mechanics — telecom/TCPA-aware counsel, given SMS compliance carries real regulatory risk in the US specifically.
- A2P 10DLC campaign registration content (what the brand/campaign is registered as) — should be reviewed against actual message content before submission, since mismatched registration is a common cause of carrier filtering.
- Cyber-insurance needs — once real customer/driver PII is in production, evaluate with an insurance broker (also see budget doc).
