# Security rotation and tunnel retirement

The former deploy credential must be revoked and replaced in the deployment
provider and every operator environment. The old value is intentionally not
printed, copied, or included in this repository. Rotation is an operator action
because this repository does not have access to the deployment provider's
secret store.

After rotation:

1. Revoke the old deploy credential at the provider.
2. Create a replacement with the minimum required scope and an expiry policy.
3. Store it only in the provider secret store or the host's protected secret
   store; do not add it to `.env`, source files, logs, or Git history.
4. Confirm that application startup and administrative routes use the current
   `APP_PASSWORD` policy.
5. Review provider audit logs for use of the retired credential.

The repository's named Cloudflare tunnel launcher, configuration, and startup
wrapper were removed in this remediation. Local development should bind to
loopback unless an explicitly configured, authenticated deployment requires a
different bind address.

Historical commits may still contain the retired value. Removing it from the
current tree does not rewrite Git history; perform provider revocation and,
where policy requires, a separately approved history rewrite and secret scan.
