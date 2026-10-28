# Account storage — V5.3

The connected project is SportyScope, zvwdvsibbnkekzcvkjtb. Production server variables SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY are configured. Do not enter service credentials into the website or chat. The setup SQL and account-review migration have been applied; new installations can use assets/supabase-setup.sql.

## Existing email-link account: set a password once

1. Open https://sportyscope.vercel.app/#settings and keep the Log in tab selected.
2. Enter the same email used previously and choose Set or reset password. No password is needed for this button.
3. Open the newest reset email once. It must return to the live SportyScope URL, not localhost. Choose and confirm a password with at least 8 characters.
4. You stay signed in. On another device choose Log in with that email and password. A new account uses Create account and confirms its email once.

Email requests are not successful sign-ins. An expired or reused callback shows a clear recovery message. Failed credentials and unconfirmed emails get actionable feedback. The official SDK remembers and refreshes sessions. Account workspaces save automatically; there is no manual sync or recovery-key flow.

## Supabase redirect settings

In Authentication → URL Configuration, Site URL must be https://sportyscope.vercel.app and Redirect URLs must include https://sportyscope.vercel.app/**. The user confirmed both settings were saved on 28 October 2026. Email authentication must remain enabled. The default Supabase sender has restrictions/rate limits; external users may require custom SMTP. The app reports actual provider errors.

## Automatic persistence

Current slip, picker preferences, imports, outcome journal and code-review snapshots live in scope_workspace, keyed to the verified auth user. Tickets live in scope_tickets with server-derived ownership. Changed components queue a background save after 400 ms; ticket and result updates also queue persistence. A stable Saved to Supabase message confirms completion, while real failures stay visible. Local drafts survive connection failures. Conflicting changes on two devices retain the local draft and offer an explicit choice in Account.

Legacy device drafts and earlier private-key ticket backups migrate into the first account used in that browser automatically. Keys are not requested from users or sent to another account. Restored result claims are reverified before learning. Public shared research data never receives untrusted private backup outcomes as training evidence.

## Shared data

The static CC0 archive imports in bounded, resumable chunks from the bundled source snapshot. Complete chunks are retained across visits; the manifest includes source commit, digest and actual row count. SportyBet real-team snapshots and new/corrected observations are retained as research runs. vFootball result histories are separate and retained incrementally. The app does not claim that score archives provide corners, injuries or every historical match.

The browser receives only an enabled publishable key. Private API requests verify users through Supabase getUser; user_metadata and browser-supplied user IDs do not authorize records. Tables have RLS and visitor grants revoked. The CAS save function uses invoker rights and restricted execution. Account changes do not modify these security boundaries.

Official reference: https://supabase.com/docs/guides/auth/passwords
