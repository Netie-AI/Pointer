/**
 * Cloudflare Worker for host.netie.ai (DR-0004).
 *
 * Serves the same pages as 127.0.0.1:18010. Does not import the coordinator
 * or MCP ABI - live Act stays on the laptop. Compute box remains P-06.
 */
import { createPublicFetch } from "../electron/netie/host-serve.js";

export default {
  async fetch(request, env) {
    const readAsset = async (file) => {
      if (!env || !env.ASSETS) return null;
      const res = await env.ASSETS.fetch(new Request(new URL("/" + file, request.url)));
      if (!res.ok) return null;
      return await res.arrayBuffer();
    };
    return createPublicFetch(readAsset)(request);
  },
};
