// Every Threads-specific selector and label lives here.
// Threads uses generated class names that change with each release, so
// everything is found by role, ARIA attribute, link and text instead. Seen on
// www.threads.com in October 2026.

var BOM_THREADS_SELECTORS = {
  // One post, reply, quoted post or activity item. A quoted post is a
  // container inside its quoting post's container.
  post: '[data-pressable-container="true"]',

  // Links to a profile ("/@name") or to a post ("/@name/post/…"). A post's
  // own permalink wraps its <time>; the author is whoever it names, which
  // skips the "name reposted" line above a repost.
  profileLink: 'a[href*="/@"]',
  time: 'time',

  // A post's "More" (…) button opens a role="menu" with Mute / Restrict /
  // Block / Report, and "Block" opens a role="dialog" titled
  // "Block name?" with Block / Cancel buttons.
  menuButton: '[role="button"][aria-haspopup="menu"]',
  menu: '[role="menu"]',
  menuItem: '[role="menuitem"]',
  dialog: '[role="dialog"], [role="alertdialog"]',
  dialogTitle: 'h1, h2, [role="heading"]',
  button: '[role="button"], button',

  // A profile page's header: the display name, followed by the username in
  // a span[translate="no"] (not the one in the bio's link).
  profileName: '[data-column-scrollable] h1[translate="no"]',
  profileHandle: 'span[translate="no"]',

  // The signed-in user's own profile link, in the side navigation.
  selfLink: '[role="navigation"] a[href*="/@"]',
};

// Text labels, matched case-insensitively against visible text or
// aria-label. English only for now.
var BOM_THREADS_LABELS = {
  moreButton: /^more$/i,
  blockMenuItem: /^block$/i,
  blockConfirm: /^block$/i,
  cancel: /^cancel$/i,
};
