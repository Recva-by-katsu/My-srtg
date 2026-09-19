import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext configuration for Cloudflare Workers/Pages.
 *
 * The app talks to D1, KV and R2 through their HTTP APIs using fetch, so no
 * bindings are strictly required. Adding them here is optional and only useful
 * if you want to switch the database adapter to a native binding later on.
 */
export default defineCloudflareConfig({});
