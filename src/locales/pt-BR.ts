import type { Messages } from '../lib/i18n';

export const ptBR: Messages = {
  appTitle: 'Contas que você segue e pararam de postar • {host}',
  description: 'Descubra quem um @ segue no Bluesky e parou de postar. Roda no seu navegador.',
  skip: 'Ir para o conteúdo',

  'theme.light': 'claro',
  'theme.dark': 'escuro',
  'theme.terminal': 'terminal',
  'theme.aria': 'Tema: {current}, toque para {next}',

  'privacy.public': 'A consulta roda no seu navegador. Nada é guardado nem enviado para servidores nossos.',
  'privacy.session':
    'A consulta roda no seu navegador. Nada é guardado nem enviado para servidores nossos. Com login, a sessão fica só nesta aba.',

  'search.title': 'Quem parou de postar',
  'search.lede': 'Descubra quem um @ segue no Bluesky e parou de postar.',
  'search.label': '@ no Bluesky',
  'search.placeholder': 'voce.bsky.social',
  'search.run': 'Verificar',
  'search.stop': 'Parar',
  'search.continue': 'Continuar',
  'search.hint': 'Vale qualquer conta pública. Mudar as opções só refiltra o que já foi lido.',

  'rules.legend': 'O que conta como atividade',
  'rules.minDays': 'Sem postar há mais de',
  'rules.days': { one: '{count} dia', other: '{count} dias' },
  'rules.replies': 'Contar respostas',
  'rules.reposts': 'Contar reposts',

  'auth.title': 'Como você quer usar?',
  'auth.pitch':
    'Entre com a sua conta para deixar de seguir quem sumiu da sua lista, ou continue sem login para consultar qualquer conta pública.',
  'auth.atmosphere': 'Funciona com o Bluesky e com qualquer servidor do AT Protocol (Atmosphere).',
  'auth.signIn': 'Entrar com o Bluesky',
  'auth.signInOther': 'Entrar com outra conta da Atmosphere',
  'auth.handleLabel': 'Seu handle ou servidor',
  'auth.handleHint': 'voce.exemplo.com ou https://pds.exemplo.com',
  'auth.continue': 'Continuar',
  'auth.explain':
    'Buscamos o servidor (PDS) do seu handle e levamos você até ele para entrar. Sua senha nunca passa por este site.',
  'auth.needHandle': 'Informe o handle.',
  'auth.skip': 'Continuar sem login',
  'auth.anonymous': 'Sem login.',
  'auth.backToSignIn': 'Entrar para deixar de seguir',
  'auth.signOut': 'Sair',
  'auth.unavailable': 'O login não funciona neste endereço.',
  'auth.redirecting': 'Abrindo o seu servidor…',
  'auth.failed': 'Não deu para entrar: {message}',

  'status.idle': 'Digite um @ e clique em Verificar.',
  'status.resolving': 'Procurando @{handle}…',
  'status.invalid': 'Isso não parece um @, um DID ou um link de perfil.',
  'status.notfound': 'Não achei @{handle}.',
  'status.deactivated': '@{handle} está desativada.',
  'status.takendown': '@{handle} foi suspensa.',
  'status.error': 'Algo deu errado: {message}',
  'status.none': '@{handle} não segue ninguém.',
  'status.done': { one: 'Pronto. {count} conta lida.', other: 'Pronto. {count} contas lidas.' },
  'status.stopped': 'Parado com {done} de {total} contas lidas. Continuar retoma de onde parou.',

  'progress.title': 'Lendo',
  'progress.count': '{done} de {total}',
  'progress.resolve': 'Procurando a conta…',
  'progress.follows': 'Carregando quem @{handle} segue… {done} de {total}',
  'progress.records': 'Conferindo os seus registros de follow… {done}',
  'progress.profiles': 'Carregando perfis… {done} de {total} lotes',
  'progress.feeds': 'Verificando os últimos posts… {done} de {total}',
  'progress.large': {
    one: 'São {count} conta. Uma consulta por conta.',
    other:
      'São {count} contas. Uma consulta por conta: pode levar vários minutos. Os resultados aparecem enquanto chegam, e Parar guarda o que já veio.',
  },
  'progress.wait': 'O Bluesky pediu para ir mais devagar. Todas as consultas esperam juntas. Retomando em {seconds}s.',

  'results.public': 'Seguidos de @{handle}',
  'results.mine': 'A sua lista (@{handle})',
  'results.meta': {
    zero: '{shown} de {count} contas no filtro',
    one: '{shown} de {count} conta no filtro',
    other: '{shown} de {count} contas no filtro',
  },
  'results.metaPublic': 'Lista pública de seguidos de @{handle}. Não dá para saber se esse @ é seu.',
  'results.search': 'Nome ou @',
  'results.csv': 'Exportar CSV',
  'results.empty': 'Nenhuma conta corresponde ao filtro.',
  'results.more': { one: 'Mostrar mais {count}', other: 'Mostrar mais {count}' },
  'results.failed': {
    one: '{count} conta não carregou. Continuar tenta de novo.',
    other: '{count} contas não carregaram. Continuar tenta de novo.',
  },
  'results.profile': 'Abrir o perfil de {name} no Bluesky',

  'badge.deactivated': 'Desativada',
  'badge.takendown': 'Suspensa',
  'badge.notfound': 'Não encontrada',
  'badge.never': 'Nunca postou',
  'badge.quiet': 'Sem postar há {span}',
  'badge.quietAtLeast': 'Sem postar há {span} ou mais',

  'span.days': { one: '{count} dia', other: '{count} dias' },
  'span.months': { one: '{count} mês', other: '{count} meses' },
  'span.years': { one: '{count} ano', other: '{count} anos' },

  'when.at': 'Última atividade em {date}',
  'when.atLeast': 'Nada que conte desde {date}, pelo menos',
  'when.never': 'Nada que conte no feed',
  'when.deactivated': 'A conta foi desativada',
  'when.takendown': 'A conta foi suspensa',
  'when.notfound': 'A conta não existe mais',

  'row.mark': 'Marcar {name}',

  'owner.markAll': { zero: 'Marcar todas do filtro', one: 'Marcar a do filtro', other: 'Marcar todas do filtro ({count})' },
  'owner.clear': 'Desmarcar',
  'owner.unfollow': {
    zero: 'Deixar de seguir',
    one: 'Deixar de seguir {count} conta',
    other: 'Deixar de seguir {count} contas',
  },

  'confirm.title': { one: 'Deixar de seguir {count} conta?', other: 'Deixar de seguir {count} contas?' },
  'confirm.text':
    'Estas contas deixam de ser seguidas por @{handle}. Enquanto esta aba estiver aberta, Desfazer volta a seguir as mesmas contas, com a data original.',
  'confirm.go': { one: 'Deixar de seguir {count} conta', other: 'Deixar de seguir {count} contas' },
  'confirm.cancel': 'Cancelar',
  'confirm.stop': 'Parar',
  'confirm.indexing': 'Lendo os seus registros de follow… {count}',
  'confirm.running': 'Deixando de seguir… {done} de {total}',
  'confirm.error': 'Não deu para continuar: {message}',

  'undo.text': { one: 'Você deixou de seguir {count} conta.', other: 'Você deixou de seguir {count} contas.' },
  'undo.failed': { one: '{count} falhou e continua seguida.', other: '{count} falharam e continuam seguidas.' },
  'undo.missing': {
    one: '{count} já não estava na sua lista.',
    other: '{count} já não estavam na sua lista.',
  },
  'undo.run': 'Desfazer',
  'undo.running': 'Voltando a seguir… {done} de {total}',
  'undo.done': { one: 'Pronto: {count} conta seguida de novo.', other: 'Pronto: {count} contas seguidas de novo.' },

  'faq.title': 'Perguntas frequentes',
  'faq.login.q': 'Preciso entrar com a minha conta?',
  'faq.login.a':
    'Não. Sem login dá para consultar a lista pública de quem qualquer conta segue. O login só serve para deixar de seguir contas da sua própria lista.',
  'faq.quiet.q': 'O que conta como parar de postar?',
  'faq.quiet.a':
    'A data da última atividade da conta. Respostas e reposts contam se as opções estiverem marcadas. Quem passou do período escolhido aparece na lista.',
  'faq.data.q': 'Meus dados vão para algum servidor?',
  'faq.data.a':
    'Não. A consulta roda no seu navegador, direto na API pública do Bluesky. No login, você entra pelo seu próprio servidor e a senha nunca passa por este site. A permissão cobre só seguir e deixar de seguir.',
  'faq.undo.q': 'Dá para desfazer?',
  'faq.undo.a':
    'Sim. Depois de deixar de seguir, Desfazer volta a seguir as mesmas contas, com a data original, enquanto esta aba estiver aberta.',
  'faq.deactivated.q': 'Por que uma conta desativada não aparece?',
  'faq.deactivated.a':
    'Conta desativada some da lista pública de quem a pessoa segue. Ela só aparece quando você entra e vê a sua própria lista.',
  'faq.slow.q': 'Por que demora?',
  'faq.slow.a':
    'É uma consulta por conta seguida. Quando o Bluesky pede para ir mais devagar, o site espera e retoma sozinho. Parar guarda o que já veio, e Continuar retoma de onde parou.',

  'footer.status': 'Em construção. Espere bugs',
  'footer.bug': 'achou um?',
  'footer.partOf': 'parte do',
  'footer.by': 'por',
  'footer.source': 'ver código',
  'footer.privacy': 'Privacidade',
  'footer.fromBrazil':
    'Direto do Brasil pelo Joselito, com muito carinho. Este site não usa cookies nem analytics. Idioma e tema ficam neste navegador. Não tem relação com o Bluesky.',
  'footer.support': 'Apoie este projeto:',
};
