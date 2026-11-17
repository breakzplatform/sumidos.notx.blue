import type { Messages } from '../lib/i18n';

export const ptBR: Messages = {
  appTitle: 'Contas que você segue e pararam de postar • {host}',
  description: 'Descubra quem uma conta do Bluesky segue e parou de postar. Roda no seu navegador.',
  ogImageAlt: '{host}: quem você segue e parou de postar',
  skip: 'Ir para o conteúdo',

  'theme.light': 'claro',
  'theme.dark': 'escuro',
  'theme.terminal': 'terminal',
  'theme.aria': 'Tema: {current}, toque para {next}',

  'privacy.public': 'A consulta roda no seu navegador. Nada é enviado para servidores nossos, e a última lista fica salva só neste navegador.',
  'privacy.session':
    'A consulta roda no seu navegador. Nada é enviado para servidores nossos, e a última lista fica salva só neste navegador. Com login, a sessão fica só nesta aba.',

  'search.title': 'Quem parou de postar?',
  'search.lede': 'Descubra quem uma conta do Bluesky segue e parou de postar.',
  'search.label': 'Conta no Bluesky',
  'search.placeholder': 'voce.bsky.social',
  'search.run': 'Verificar',
  'search.stop': 'Parar',
  'search.continue': 'Continuar',
  'search.hint': 'Vale qualquer conta pública. Mudar as opções só refiltra o que já foi lido.',

  'rules.legend': 'O que conta como atividade',
  'rules.minDays': 'Sem postar há mais de',
  'rules.days': { one: '{count} dia', other: '{count} dias' },
  'rules.maxDays': 'e no máximo',
  'rules.noMax': 'sem limite',
  'rules.replies': 'Incluir respostas',
  'rules.reposts': 'Incluir reposts',

  'auth.title': 'Como você quer usar?',
  'auth.pitch':
    'Entre com a sua conta para deixar de seguir quem sumiu da skyline, ou continue sem login para consultar qualquer conta pública.',
  'auth.atmosphere': 'Funciona com o Bluesky e com qualquer servidor do AT Protocol (Atmosphere).',
  'auth.signIn': 'Entrar com o Bluesky',
  'auth.signInOther': 'Entrar com o ATProto',
  'auth.handleLabel': 'Sua conta ou servidor',
  'auth.handleHint': 'voce.exemplo.com ou https://pds.exemplo.com',
  'auth.continue': 'Continuar',
  'auth.explain':
    'Buscamos o servidor (PDS) da sua arroba e levamos você até ele para entrar. Sua senha nunca passa por este site.',
  'auth.needHandle': 'Informe a sua conta.',
  'auth.skip': 'Continuar sem login',
  'auth.anonymousLead': 'Sem login:',
  'auth.anonymous': 'dá para consultar qualquer conta. Para deixar de seguir, entre com a sua.',
  'auth.backToSignIn': 'Entrar',
  'auth.signOut': 'Sair',
  'auth.unavailable': 'O login não funciona neste endereço.',
  'auth.redirecting': 'Abrindo o seu servidor…',
  'auth.failed': 'Não deu para entrar: {message}',

  'status.idle': 'Digite uma conta e clique em Verificar.',
  'status.resolving': 'Procurando @{handle}…',
  'status.invalid': 'Isso não parece uma arroba, um DID ou um link de perfil.',
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
      'São {count} contas. Uma consulta por conta: pode levar vários minutos.',
  },
  'progress.wait': 'O Bluesky pediu para ir mais devagar. Todas as consultas esperam juntas. Retomando em {seconds}s.',

  'results.public': 'Seguidos de @{handle}',
  'results.mine': 'A sua lista (@{handle})',
  'results.meta': {
    zero: '{shown} de {count} contas no filtro',
    one: '{shown} de {count} conta no filtro',
    other: '{shown} de {count} contas no filtro',
  },
  'results.maxDays': 'E no máximo',
  'results.kind': 'Mostrar',
  'results.kind.all': 'Todas',
  'results.kind.quiet': 'Contas ativas sem postar',
  'results.kind.unavailable': 'Desativadas ou suspensas',
  'results.kind.invalidHandle': 'Com arroba inválida',
  'results.search': 'Nome ou arroba',
  'results.csv': 'Exportar CSV',
  'results.empty': 'Nenhuma conta corresponde ao filtro.',
  'saved.note': 'Lista salva em {date}. Verificar lê de novo.',
  'saved.clear': 'Apagar lista salva',
  'unfollowed.title': 'Deixou de seguir',
  'unfollowed.note': 'Quem você deixou de seguir por aqui fica salvo neste navegador. Seguir de novo volta com a data original.',
  'unfollowed.all': { one: 'Seguir de novo', other: 'Seguir todas de novo ({count})' },
  'unfollowed.one': 'Seguir de novo',
  'unfollowed.at': 'Deixou de seguir em {date}',
  'pager.perPage': 'Por página',
  'pager.prev': 'Anterior',
  'pager.next': 'Próxima',
  'pager.page': 'Página {page} de {pages}',
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
    'Não. A consulta roda no seu navegador, direto na API pública do Bluesky. A última lista e quem você deixou de seguir ficam salvos só neste navegador. No login, você entra pelo seu próprio servidor e a senha nunca passa por este site. A permissão cobre só seguir e deixar de seguir.',
  'faq.undo.q': 'Dá para desfazer?',
  'faq.undo.a':
    'Sim. Depois de deixar de seguir, Desfazer volta a seguir as mesmas contas, com a data original, enquanto esta aba estiver aberta. Depois disso, use o painel Deixou de seguir.',
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
    'Direto do Brasil pelo Joselito, com muito carinho. Este site não usa cookies nem analytics. Idioma, tema e a última lista ficam neste navegador. Não tem relação com o Bluesky.',
  'footer.support': 'Apoie este projeto:',
};
