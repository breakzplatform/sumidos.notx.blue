import type { Messages } from '../lib/i18n';

export const en: Messages = {
  appTitle: 'Accounts you follow that stopped posting • {host}',
  description: 'Find out who a Bluesky handle follows that stopped posting. Runs in your browser.',
  skip: 'Skip to content',

  'theme.light': 'light',
  'theme.dark': 'dark',
  'theme.terminal': 'terminal',
  'theme.aria': 'Theme: {current}, tap for {next}',

  'privacy.public': 'The lookup runs in your browser. Nothing is sent to our servers, and the last list is saved in this browser only.',
  'privacy.session':
    'The lookup runs in your browser. Nothing is sent to our servers, and the last list is saved in this browser only. When signed in, the session stays in this tab only.',

  'search.title': 'Who stopped posting',
  'search.lede': 'Find out who a Bluesky handle follows that stopped posting.',
  'search.label': 'Bluesky handle',
  'search.placeholder': 'you.bsky.social',
  'search.run': 'Check',
  'search.stop': 'Stop',
  'search.continue': 'Continue',
  'search.hint': 'Any public account works. Changing the options only re-filters what was already read.',

  'rules.legend': 'What counts as activity',
  'rules.minDays': 'No posts for more than',
  'rules.days': { one: '{count} day', other: '{count} days' },
  'rules.replies': 'Count replies',
  'rules.reposts': 'Count reposts',

  'auth.title': 'How do you want to use it?',
  'auth.pitch':
    'Sign in to unfollow the accounts that went quiet on your skyline, or continue without signing in to check any public account.',
  'auth.atmosphere': 'Works with Bluesky and any AT Protocol (Atmosphere) server.',
  'auth.signIn': 'Sign in with Bluesky',
  'auth.signInOther': 'Sign in with AT Proto',
  'auth.handleLabel': 'Your handle or server',
  'auth.handleHint': 'you.example.com or https://pds.example.com',
  'auth.continue': 'Continue',
  'auth.explain':
    'We look up the server (PDS) behind your handle and send you there to sign in. Your password never touches this site.',
  'auth.needHandle': 'Enter your handle.',
  'auth.skip': 'Continue without signing in',
  'auth.anonymous': 'Not signed in: you can check any account. To unfollow, sign in with yours.',
  'auth.backToSignIn': 'Sign in',
  'auth.signOut': 'Sign out',
  'auth.unavailable': 'Sign-in does not work on this address.',
  'auth.redirecting': 'Opening your server…',
  'auth.failed': 'Could not sign in: {message}',

  'status.idle': 'Type a handle and press Check.',
  'status.resolving': 'Looking up @{handle}…',
  'status.invalid': 'That does not look like a handle, a DID or a profile link.',
  'status.notfound': 'Could not find @{handle}.',
  'status.deactivated': '@{handle} is deactivated.',
  'status.takendown': '@{handle} was suspended.',
  'status.error': 'Something went wrong: {message}',
  'status.none': '@{handle} follows nobody.',
  'status.done': { one: 'Done. {count} account read.', other: 'Done. {count} accounts read.' },
  'status.stopped': 'Stopped with {done} of {total} accounts read. Continue picks up where it stopped.',

  'progress.title': 'Reading',
  'progress.count': '{done} of {total}',
  'progress.resolve': 'Looking up the account…',
  'progress.follows': 'Loading who @{handle} follows… {done} of {total}',
  'progress.records': 'Checking your follow records… {done}',
  'progress.profiles': 'Loading profiles… {done} of {total} batches',
  'progress.feeds': 'Checking the latest posts… {done} of {total}',
  'progress.large': {
    one: '{count} account. One request per account.',
    other:
      '{count} accounts. One request per account: this can take several minutes. Results show up as they arrive, and Stop keeps what came in.',
  },
  'progress.wait': 'Bluesky asked us to slow down. All requests wait together. Resuming in {seconds}s.',

  'results.public': 'Follows of @{handle}',
  'results.mine': 'Your list (@{handle})',
  'results.meta': {
    zero: '{shown} of {count} accounts match the filter',
    one: '{shown} of {count} account matches the filter',
    other: '{shown} of {count} accounts match the filter',
  },
  'results.metaPublic': 'Public list of who @{handle} follows. There is no way to tell whether this handle is yours.',
  'results.search': 'Name or handle',
  'results.csv': 'Export CSV',
  'results.empty': 'No account matches the filter.',
  'saved.note': 'List saved on {date}. Check reads it again.',
  'saved.clear': 'Delete saved list',
  'unfollowed.title': 'Unfollowed',
  'unfollowed.note': 'Everyone you unfollowed here is saved in this browser. Follow again brings back the original date.',
  'unfollowed.all': { one: 'Follow again', other: 'Follow all again ({count})' },
  'unfollowed.one': 'Follow again',
  'unfollowed.at': 'Unfollowed on {date}',
  'pager.perPage': 'Per page',
  'pager.prev': 'Previous',
  'pager.next': 'Next',
  'pager.page': 'Page {page} of {pages}',
  'results.loading': {
    one: 'Reading… {count} account so far. The sorted list shows up at the end.',
    other: 'Reading… {count} accounts so far. The sorted list shows up at the end.',
  },
  'results.failed': {
    one: '{count} account did not load. Continue tries again.',
    other: '{count} accounts did not load. Continue tries again.',
  },
  'results.profile': 'Open the Bluesky profile of {name}',

  'badge.deactivated': 'Deactivated',
  'badge.takendown': 'Suspended',
  'badge.notfound': 'Not found',
  'badge.never': 'Never posted',
  'badge.quiet': 'Quiet for {span}',
  'badge.quietAtLeast': 'Quiet for {span} or more',

  'span.days': { one: '{count} day', other: '{count} days' },
  'span.months': { one: '{count} month', other: '{count} months' },
  'span.years': { one: '{count} year', other: '{count} years' },

  'when.at': 'Last activity on {date}',
  'when.atLeast': 'Nothing that counts since {date}, at least',
  'when.never': 'Nothing that counts in the feed',
  'when.deactivated': 'The account was deactivated',
  'when.takendown': 'The account was suspended',
  'when.notfound': 'The account no longer exists',

  'row.mark': 'Mark {name}',

  'owner.markAll': { zero: 'Mark all in the filter', one: 'Mark the one in the filter', other: 'Mark all in the filter ({count})' },
  'owner.clear': 'Unmark',
  'owner.unfollow': {
    zero: 'Unfollow',
    one: 'Unfollow {count} account',
    other: 'Unfollow {count} accounts',
  },

  'confirm.title': { one: 'Unfollow {count} account?', other: 'Unfollow {count} accounts?' },
  'confirm.text':
    '@{handle} will stop following these accounts. While this tab stays open, Undo follows the same accounts again, with the original date.',
  'confirm.go': { one: 'Unfollow {count} account', other: 'Unfollow {count} accounts' },
  'confirm.cancel': 'Cancel',
  'confirm.stop': 'Stop',
  'confirm.indexing': 'Reading your follow records… {count}',
  'confirm.running': 'Unfollowing… {done} of {total}',
  'confirm.error': 'Could not go on: {message}',

  'undo.text': { one: 'You unfollowed {count} account.', other: 'You unfollowed {count} accounts.' },
  'undo.failed': { one: '{count} failed and is still followed.', other: '{count} failed and are still followed.' },
  'undo.missing': { one: '{count} was no longer on your list.', other: '{count} were no longer on your list.' },
  'undo.run': 'Undo',
  'undo.running': 'Following again… {done} of {total}',
  'undo.done': { one: 'Done: {count} account followed again.', other: 'Done: {count} accounts followed again.' },

  'faq.title': 'Questions',
  'faq.login.q': 'Do I need to sign in?',
  'faq.login.a':
    'No. Without signing in you can check the public list of who any account follows. Signing in is only needed to unfollow accounts on your own list.',
  'faq.quiet.q': 'What counts as gone quiet?',
  'faq.quiet.a':
    "The date of the account's last activity. Replies and reposts count when those options are checked. Anyone past the chosen period shows up on the list.",
  'faq.data.q': 'Does my data go to a server?',
  'faq.data.a':
    "No. The lookup runs in your browser, straight against Bluesky's public API. The last list and the accounts you unfollowed are saved in this browser only. When you sign in, you do it on your own server and your password never passes through this site. The permission only covers following and unfollowing.",
  'faq.undo.q': 'Can I undo it?',
  'faq.undo.a':
    'Yes. After unfollowing, Undo follows the same accounts again, with the original date, while this tab stays open. After that, use the Unfollowed panel.',
  'faq.deactivated.q': "Why doesn't a deactivated account show up?",
  'faq.deactivated.a':
    'A deactivated account drops out of the public list of who someone follows. It only shows up when you sign in and look at your own list.',
  'faq.slow.q': 'Why does it take a while?',
  'faq.slow.a':
    "It's one request per followed account. When Bluesky asks to slow down, the site waits and resumes on its own. Stop keeps what has arrived, and Continue picks up where it stopped.",

  'footer.status': 'Work in progress. Expect bugs',
  'footer.bug': 'found one?',
  'footer.partOf': 'part of',
  'footer.by': 'by',
  'footer.source': 'view-source',
  'footer.privacy': 'Privacy',
  'footer.fromBrazil':
    'Directly from Brazil by Joselito, with much love and care. This site uses no cookies and no analytics. Language, theme and the last list stay in this browser. It is not related to Bluesky.',
  'footer.support': 'Support this project:',
};
