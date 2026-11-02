# Turning on "Sign in with your organization" (SAML)

This guide is for the project owner. It explains how to let people sign in with the organization's
own identity provider (for example Okta, Microsoft Entra ID, Google Workspace or JumpCloud) using
SAML 2.0. You only need it if you decide to turn SAML on. Until then the app behaves as if SAML
doesn't exist.

No passwords, keys or certificates belong in this document or in the code repository. Keep them in
the Supabase dashboard, the identity provider's admin console, or Vercel's environment settings.

## What people see

When SAML is on, the sign-in page shows a **Sign in with your organization** button under the Google
button. The person clicks it, types their work email (for example `ann@example.org`) and presses
**Continue with your organization**. The app looks up which identity provider owns `example.org`
and sends them there. After they sign in with the provider, they come back to the app.

- **First sign-in:** an account is created with status **pending**, the same as for Google and
  password sign-ups. An admin approves it in **Admin → Users** before the person can see anything.
- **Email domain not set up:** the person sees "We couldn't find organization sign-in for that
  email address. Check it, or use another way to sign in." Nothing else happens.
- **SAML switched off:** there is no button. If someone calls the sign-in action directly, it refuses
  without contacting Supabase.

## Before you start

1. **Supabase plan.** SAML single sign-on needs a Supabase plan that includes it (Pro or above at
   the time of writing). Check **Project settings → Billing** and Supabase's pricing page.
2. **App changes.** Two small changes were proposed in
   `agent-spec/change-requests/AUTH-03-saml-provisioning.md`. One shows the button on the sign-in
   page; the other lets first-time SAML users through account creation. Make sure both have been
   merged before you turn SAML on. Without them, the button doesn't appear and first-time SAML users
   are turned away.
3. **Who does what.** You need someone who can administer the identity provider (to create the SAML
   app there) and someone with the Supabase CLI logged in to this project (`supabase login`, then
   `supabase link --project-ref <project-ref>`).
4. **Testing.** Use a hosted Supabase project, such as a staging project. SAML sign-in can't be
   fully tested against the local `supabase start` stack.

## Step 1. Get the app's SAML details from Supabase

Your identity provider needs to know where to send people back to. Supabase acts as the "service
provider". Find its details with:

```bash
supabase sso info --project-ref <project-ref>
```

This prints three things:

- **Metadata URL**: `https://<project-ref>.supabase.co/auth/v1/sso/saml/metadata`
- **ACS URL** (Assertion Consumer Service, also called "reply URL" or "single sign-on URL"):
  `https://<project-ref>.supabase.co/auth/v1/sso/saml/acs`
- **Entity ID**: the same as the metadata URL

## Step 2. Create the SAML app in your identity provider

In the provider's admin console, create a new **SAML 2.0** application. The exact wording differs
by provider; "custom SAML app" or "enterprise application" are common names.

1. Enter the **ACS URL** and **Entity ID** from Step 1, or upload or point to the metadata URL if the
   provider accepts it.
2. **Name ID**: use the person's email address, in the format
   `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` or "persistent". Pick a value that
   never changes for a person.
3. **Attributes** to send:

   | Attribute (example name)  | Value                    | Needed?                                                                              |
   | ------------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
   | `email`                   | the person's work email  | **Required.** Accounts are matched by email.                                         |
   | `name` (or `displayName`) | full name                | Recommended; shown in the app. Without it, the part of the email before `@` is used. |
   | `groups`                  | the person's group names | Optional. Used only to _suggest_ a branch; see Step 4.                               |

4. Assign the app to the people or groups who should be able to sign in.
5. Download the provider's **metadata XML**, or copy its **metadata URL**. A URL is better because
   certificate changes are picked up automatically.

## Step 3. Register the provider with Supabase

Create an attribute-mapping file, for example `saml-mapping.json`. It tells Supabase which incoming
attribute is which. Replace the `name` values with the exact attribute names your provider sends:

```json
{
  "keys": {
    "email": { "name": "email" },
    "name": { "name": "name" },
    "groups": { "name": "groups", "array": true }
  }
}
```

Then register the provider, listing every email domain your people use:

```bash
supabase sso add --type saml --project-ref <project-ref> \
  --metadata-url 'https://idp.example.org/app/metadata' \
  --domains example.org,mail.example.org \
  --attribute-mapping-file ./saml-mapping.json
```

If you have a metadata file instead of a URL, use `--metadata-file ./idp-metadata.xml`. Don't commit
that file.

Useful follow-ups:

```bash
supabase sso list --project-ref <project-ref>                      # see registered providers and their IDs
supabase sso show <provider-id> --project-ref <project-ref>        # check domains and mapping
supabase sso update <provider-id> --project-ref <project-ref> \
  --add-domains another.example.org                                # add a domain later
supabase sso update <provider-id> --project-ref <project-ref> \
  --attribute-mapping-file ./saml-mapping.json                     # change the mapping
supabase sso remove <provider-id> --project-ref <project-ref>      # unregister
```

## Step 4. Groups and branches (optional)

New accounts always start **pending**, whatever groups the person is in. An admin approves them and
sets their branch.

If your provider sends a `groups` attribute and a branch has its **SSO group** set to one of those
group names, the app fills that branch in as a _suggestion_ for the approving admin. Group names
are compared without regard to upper and lower case. To use this:

1. Send group **names**, not internal IDs, if your provider gives the choice. (Entra ID sends
   object IDs unless told otherwise.)
2. Set each branch's SSO group to the matching group name.
3. After a test person signs in, check in the Supabase dashboard (**Authentication → Users →** the
   person **→ Raw user metadata**) that the groups appear under `groups` or `custom_claims.groups`.
   The app reads either place. If they appear somewhere else, ask a developer to adjust the
   mapping.

## Step 5. Allow the return address

In the Supabase dashboard, open **Authentication → URL Configuration → Redirect URLs**. Check that
`https://<your-app-domain>/auth/callback**` is listed. Google sign-in already needs this entry, so it
is probably there. Add the Vercel preview pattern too if you want to test on previews.

## Step 6. Switch it on in the app

In Vercel, open **Project → Settings → Environment Variables** and set:

```
FEATURE_SAML=true
```

Start with **Preview** only and test there; add **Production** when you're happy. Redeploy so the
new value takes effect. To switch SAML off again, set `FEATURE_SAML=false` (or delete it) and
redeploy. The button disappears and the sign-in action refuses SAML requests. Accounts created
through SAML stay, and those people can still sign in another way, for example with a password
reset.

## Step 7. Test it

1. Open the sign-in page. You should see **Sign in with your organization**.
2. Enter an email at a domain that is _not_ registered. You should see the "couldn't find
   organization sign-in" message.
3. Enter a test person's work email. You should go to the provider, sign in, and come back.
4. A brand-new person should land on the **awaiting approval** page. Approve them in **Admin →
   Users** and sign in again. They should reach the Worship Library.
5. Someone who already has an account with the same email (for example from a password sign-up)
   may see "An account with this email already exists". In that case, ask a developer to link the
   two, or have the person keep using their existing sign-in method.

## Troubleshooting

| Symptom                                                                                            | Likely cause                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No button on the sign-in page                                                                      | `FEATURE_SAML` isn't `true` in this environment, the deploy predates the change, or the sign-in page change from the change request isn't merged yet.            |
| "couldn't find organization sign-in" for a real domain                                             | The domain isn't registered. Run `supabase sso show` and add it with `--add-domains`.                                                                            |
| The provider shows an error before sign-in                                                         | ACS URL or Entity ID mismatch. Re-copy them from `supabase sso info`.                                                                                            |
| Back at the sign-in page with "We couldn't sign you in…"                                           | The provider didn't send an email, the certificate changed (use a metadata URL), or the return address isn't allowed (Step 5). Check **Supabase → Logs → Auth**. |
| A first-time SAML user is sent back with "Your organization account is not linked to a branch yet" | The account-creation change from the change request isn't merged yet, so SAML sign-ins aren't recognized.                                                        |
