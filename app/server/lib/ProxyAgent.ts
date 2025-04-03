import {appSettings} from "app/server/lib/AppSettings";
import log from 'app/server/lib/log';

import fetch, { RequestInit } from 'node-fetch';
import {ProxyAgent, ProxyAgentOptions} from "proxy-agent";

export class GristProxyAgent extends ProxyAgent {
  constructor(public readonly proxyUrl: string, opts?: Omit<ProxyAgentOptions, 'getProxyForUrl'>) {
    super({
      ...opts,
      getProxyForUrl: () => this.proxyUrl
    });
  }
}

function generateProxyAgents() {
  const proxyForTrustedRequestsUrl = appSettings.section('proxy').readString({
    envVar: ['HTTPS_PROXY', 'https_proxy'],
    preferredEnvVar: 'HTTPS_PROXY',
  });

  const proxyForUntrustedRequestsUrl = appSettings.section('proxy').readString({
    envVar: ['GRIST_PROXY_FOR_UNTRUSTED_URLS', 'GRIST_HTTPS_PROXY'],
    preferredEnvVar: 'GRIST_PROXY_FOR_UNTRUSTED_URLS'
  });

  if (process.env.GRIST_HTTPS_PROXY) {
    log.warn('GRIST_HTTPS_PROXY is deprecated in favor of GRIST_PROXY_FOR_UNTRUSTED_URLS. ' +
      `Please rather set GRIST_PROXY_FOR_UNTRUSTED_URLS="${proxyForTrustedRequestsUrl}"`);
  }

  return {
    trusted: proxyForTrustedRequestsUrl ? new GristProxyAgent(proxyForTrustedRequestsUrl) : undefined,
    untrusted: (proxyForUntrustedRequestsUrl && proxyForUntrustedRequestsUrl !== "direct")
      ? new GristProxyAgent(proxyForUntrustedRequestsUrl) : undefined
  };
}

export const test_generateProxyAgents = generateProxyAgents;

// Instantiate all the possible agents at startup.
export const agents = generateProxyAgents();

async function proxyFetch(requestUrl: URL|string, options?: Omit<RequestInit, 'agent'>, agent?: GristProxyAgent) {
  if (!agent) {
    return await fetch(requestUrl, options);
  }
  requestUrl = new URL(requestUrl);

  try {
    return await fetch(requestUrl, {...options, agent});
  } catch(e) {
    // Include info helpful for diagnosing issues (but not the potentially sensitive full requestUrl).
    log.rawWarn(`ProxyAgent error ${e}`,
      {proxy: agent.proxyUrl, reqProtocol: requestUrl.protocol, requestHost: requestUrl.origin});
    throw e;
  }
}

/**
 * If configured using HTTPS_PROXY env var, use node-fetch with conigured proxy agemt
 * Otherwise just use fetch without agent.
 *
 * If the request failed with agent, log a warning with relevant information.
 */
export async function trustedFetchWithAgent(requestUrl: URL|string, options?: Omit<RequestInit, 'agent'>) {
  return await proxyFetch(requestUrl, options, agents.trusted);
}

/**
 * If configured using GRIST_PROXY_FOR_UNTRUSTED_URLS env var, use node-fetch with conigured proxy agemt
 * Otherwise just use fetch without agent.
 *
 * If the request failed with agent, log a warning with relevant information.
 */
export async function untrustedFetchWithAgent(requestUrl: URL|string, options?: Omit<RequestInit, 'agent'>) {
  return await proxyFetch(requestUrl, options, agents.untrusted);
}
