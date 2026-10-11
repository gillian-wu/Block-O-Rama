// Blocks a member by sending the request LinkedIn's own "Block member"
// dialog sends, from the page the button was clicked on. No profile tab.
//
// LinkedIn doesn't document these endpoints; they were captured from the
// site in October 2026 and can change without notice. Callers fall back to
// driving the profile page (automation.js) when anything here fails.

var BOM_DIRECT = (() => {
  const LOOKUP_URL = '/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=';
  const BLOCK_REQUEST_ID = 'com.linkedin.sdui.requests.trustReporting.block';
  const BLOCK_URL = `/flagship-web/rsc-action/actions/server-request?sduiid=${BLOCK_REQUEST_ID}`;
  const BLOCK_SCREEN_ID = 'com.linkedin.sdui.flagshipnav.trustreporting.BlockLanding';
  const SUBMIT_SCREEN_ID = 'com.linkedin.sdui.flagshipnav.trustreporting.MemberBlockSubmission';

  // LinkedIn's pages send the JSESSIONID cookie's value as a CSRF token.
  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)JSESSIONID="?([^";]+)"?/);
    if (!m) throw new Error('LinkedIn session cookie not found. Are you signed in?');
    return m[1];
  }

  // Numeric member ID ("12345") for a profile slug ("jane-doe").
  async function memberId(slug) {
    const res = await fetch(LOOKUP_URL + encodeURIComponent(slug), {
      headers: {
        'csrf-token': csrfToken(),
        accept: 'application/vnd.linkedin.normalized+json+2.1',
        'x-restli-protocol-version': '2.0.0',
      },
    });
    if (!res.ok) throw new Error(`Profile lookup failed (HTTP ${res.status}).`);
    const text = await res.text();

    // Prefer the profile whose publicIdentifier is this slug; otherwise accept
    // the response only if it names exactly one member.
    let found = null;
    const visit = (node) => {
      if (found || !node || typeof node !== 'object') return;
      if (
        typeof node.objectUrn === 'string' &&
        typeof node.publicIdentifier === 'string' &&
        node.publicIdentifier.toLowerCase() === slug.toLowerCase()
      ) {
        found = node.objectUrn;
        return;
      }
      Object.values(node).forEach(visit);
    };
    try {
      visit(JSON.parse(text));
    } catch {
      // Not JSON; fall through to the text match.
    }
    if (!found) {
      const urns = [...new Set(text.match(/urn:li:member:\d+/g) || [])];
      if (urns.length === 1) found = urns[0];
    }
    const m = found && found.match(/^urn:li:member:(\d+)$/);
    if (!m) throw new Error('Profile lookup returned no member ID.');
    return m[1];
  }

  async function block({ blockeeId, blockerId, name }) {
    const payload = {
      blockeeMemberUrn: { memberId: blockeeId },
      blockerMemberUrn: { memberId: blockerId },
      blockeeName: name,
      buttonDisabledBinding: { key: 'blockButton', namespace: 'MemoryNamespace' },
      loadingBinding: { key: 'reportPageLoadingSpinner', namespace: 'MemoryNamespace' },
      blockScreenId: BLOCK_SCREEN_ID,
      workflowId: `BLOCKING_WORKFLOW_${crypto.randomUUID()}`,
    };
    const requestedArguments = {
      $type: 'proto.sdui.actions.requests.RequestedArguments',
      requestedStateKeys: [],
      payload,
      requestMetadata: { $type: 'proto.sdui.common.RequestMetadata' },
    };
    const body = {
      requestId: BLOCK_REQUEST_ID,
      serverRequest: {
        requestId: BLOCK_REQUEST_ID,
        requestedArguments,
        isApfcEnabled: false,
        isStreaming: false,
        rumPageKey: '',
      },
      states: [],
      requestedArguments: {
        ...requestedArguments,
        states: [],
        screenId: SUBMIT_SCREEN_ID,
        knownTemplateIds: [],
      },
    };
    const res = await fetch(BLOCK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'csrf-token': csrfToken() },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Block request failed (HTTP ${res.status}).`);
    // Success looks like {"response":{"$type":"…ServerRequestResponse","errors":[],…}}.
    if (!/"errors":\[\]/.test(text) || !/ServerRequestResponse/.test(text)) {
      throw new Error('LinkedIn did not confirm the block.');
    }
  }

  return { memberId, block };
})();
