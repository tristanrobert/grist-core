import {assertMatchArray, captureLog, EnvironmentSnapshot} from "test/server/testUtils";
import {getAvailablePort} from "app/server/lib/serverUtils";
import log from "app/server/lib/log";
import {
  agents, GristProxyAgent, trustedFetchWithAgent, untrustedFetchWithAgent, test_generateProxyAgents
} from "app/server/lib/ProxyAgent";
import {serveSomething, Serving} from 'test/server/customUtil';
import {TestProxyServer} from 'test/server/lib/helpers/TestProxyServer';

import sinon from "sinon";
import {assert} from "chai";

describe("ProxyAgent", function () {
  let oldEnv: EnvironmentSnapshot;
  let warnStub: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;

  const proxyForTrustedUrlExample = 'https://localhost:9000';
  const proxyForUntrustedUrlExample = 'https://localhost:9001';
  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });

  afterEach(function () {
    sandbox?.restore();
  });

  describe('configuration', function () {
    beforeEach(() => {
      oldEnv = new EnvironmentSnapshot();
      warnStub = sandbox.stub(log, 'warn');
    });

    afterEach(() => {
      oldEnv.restore();
    });

    it('should create a proxy agent for trusted URLs when using https_proxy env var', function () {
      process.env.https_proxy = proxyForTrustedUrlExample;

      const proxyAgents = test_generateProxyAgents();

      assert.instanceOf(proxyAgents.trusted, GristProxyAgent);
      assert.isUndefined(proxyAgents.untrusted);
      sinon.assert.notCalled(warnStub);
    });

    it('should create a proxy agent for trusted URLs when using HTTPS_PROXY env var', function () {
      process.env.HTTPS_PROXY = proxyForTrustedUrlExample;

      const proxyAgents = test_generateProxyAgents();

      assert.instanceOf(proxyAgents.trusted, GristProxyAgent);
      assert.isUndefined(proxyAgents.untrusted);
      sinon.assert.notCalled(warnStub);
    });

    it('should create a proxy agent for untrusted URLs when using GRIST_PROXY_FOR_UNTRUSTED_URLS env var', function () {
      process.env.GRIST_PROXY_FOR_UNTRUSTED_URLS = proxyForUntrustedUrlExample;

      const proxyAgents = test_generateProxyAgents();

      assert.instanceOf(proxyAgents.untrusted, GristProxyAgent);
      assert.isUndefined(proxyAgents.trusted);
      sinon.assert.notCalled(warnStub);
    });

    it('should create both proxy agents for untrusted and trusted URLS using ' +
      'GRIST_PROXY_FOR_UNTRUSTED_URLS and HTTPS_PROXY', function () {
      process.env.GRIST_PROXY_FOR_UNTRUSTED_URLS = proxyForUntrustedUrlExample;
      process.env.HTTPS_PROXY = proxyForTrustedUrlExample;

      const proxyAgents = test_generateProxyAgents();

      assert.instanceOf(proxyAgents.untrusted, GristProxyAgent);
      assert.instanceOf(proxyAgents.trusted, GristProxyAgent);
      sinon.assert.notCalled(warnStub);
    });

    it('should create a proxy agent for untrusted URLs when using GRIST_HTTPS_PROXY env var ' +
      'and show a deprecation message', function () {
      process.env.GRIST_HTTPS_PROXY = proxyForUntrustedUrlExample;

      const proxyAgents = test_generateProxyAgents();

      assert.instanceOf(proxyAgents.untrusted, GristProxyAgent);
      assert.isUndefined(proxyAgents.trusted);
      sinon.assert.calledWithMatch(
        warnStub, /GRIST_HTTPS_PROXY.*GRIST_PROXY_FOR_UNTRUSTED_URLS/,
      );
    });

    it('should create no proxy agent when GRIST_PROXY_FOR_UNTRUSTED_URLS is set to "direct"', function () {
      process.env.GRIST_PROXY_FOR_UNTRUSTED_URLS = "direct";

      const proxyAgents = test_generateProxyAgents();

      assert.isUndefined(proxyAgents.untrusted);
    });
  });

  // [
  //   {
  //     testedMethod: proxyAgentForTrustedRequests,
  //     agentsToStub: "trusted",
  //   },
  //   {
  //     testedMethod: proxyAgentForUntrustedRequests,
  //     agentsToStub: "untrusted"
  //   }
  // ].forEach(ctx => {
  //   describe(ctx.testedMethod.name, function () {
  //     it('should return a proxy agent given the passed URL protocol', function () {
  //       const fakeHttpAgent = "fake http agent";
  //       const fakeHttpsAgent = "fake https agent";
  //       sinon.stub(Deps.agents, ctx.agentsToStub as any).value({
  //         "http:": fakeHttpAgent,
  //         "https:": fakeHttpsAgent,
  //       });
  //
  //       assert.equal(ctx.testedMethod(new URL("http://getgrist.com")) as any, fakeHttpAgent);
  //       assert.equal(ctx.testedMethod(new URL("https://getgrist.com")) as any, fakeHttpsAgent);
  //     });
  //
  //     it("should return nothing when no proxy is configured", function () {
  //       sinon.stub(Deps.agents, ctx.agentsToStub as any).value(undefined);
  //       assert.isUndefined(ctx.testedMethod(new URL("http://getgrist.com")));
  //       assert.isUndefined(ctx.testedMethod(new URL("https://getgrist.com")));
  //     });
  //
  //     it('should throw when the passed URL protocol is not http: or https:', function () {
  //       assert.throws(
  //         () => proxyAgentForTrustedRequests(new URL("ftp://getgrist.com"))
  //       );
  //     });
  //   });
  // });

  describe('proxy error handling', async function() {
    // Handling requests
    let serving: Serving;
    // Proxy server emulation to test possible behaviours of real life server
    let testProxyServer: TestProxyServer;

    beforeEach(async function () {
      // Set up a server and a proxy.
      const port = await getAvailablePort(22340);
      testProxyServer = await TestProxyServer.Prepare(port);
      serving = await serveSomething(app => {
        app.post('/200', (_, res) => { res.sendStatus(200); res.end(); });
        app.post('/404', (_, res) => { res.sendStatus(404); res.end(); });
      });
    });

    afterEach(async function() {
      await serving.shutdown();
      await testProxyServer.dispose().catch(() => {});
    });

    [
      {
        description: "for trusted urls",
        envToSet: "HTTPS_PROXY",
        proxyFetch: trustedFetchWithAgent
      },
      {
        description: "for untrusted url",
        envToSet: "GRIST_PROXY_FOR_UNTRUSTED_URLS",
        proxyFetch: untrustedFetchWithAgent
      },
    ].forEach(function (ctx) {
      describe(ctx.description, function() {
        beforeEach(function () {
          const proxyUrl = `http://localhost:${testProxyServer.portNumber}`;
          process.env[ctx.envToSet] = proxyUrl;
          const {untrusted, trusted} = test_generateProxyAgents();
          sandbox.stub(agents, 'trusted').value(trusted);
          sandbox.stub(agents, 'untrusted').value(untrusted);
        });

        it("should not report error when proxy is working", async function() {
          // Normally fetch through proxy works and produces no errors, even for failing status.
          const logMessages1 = await captureLog('warn', async () => {
            assert.equal((await ctx.proxyFetch(serving.url + '/200')).status, 200);
            assert.equal((await ctx.proxyFetch(serving.url + '/404')).status, 404);
          });
          assert.equal(testProxyServer.proxyCallCounter, 2, 'The proxy should have been called twice');
          assert.deepEqual(logMessages1, []);
        });

        it("should report error when proxy fails", async function() {
          // if the proxy isn't listening, fetches produces error messages.
          await testProxyServer.dispose();
          // Error message depends a little on node version.
          const logMessages2 = await captureLog('warn', async () => {
            await assert.isRejected(ctx.proxyFetch(serving.url + '/200'), /(request.*failed)|(ECONNREFUSED)/);
            await assert.isRejected(ctx.proxyFetch(serving.url + '/404'), /(request.*failed)|(ECONNREFUSED)/);
          });

          // We rely on "ProxyAgent error" message to detect issues with the proxy server.
          // Error message depends a little on node version.
          assertMatchArray(logMessages2, [
            /warn: ProxyAgent error.*((request.*failed)|(ECONNREFUSED)|(AggregateError))/,
            /warn: ProxyAgent error.*((request.*failed)|(ECONNREFUSED)|(AggregateError))/,
          ]);
        });
      });
    });
  });
});
