# Acellere Instagram MCP — bootstrap seguro

Este fork parte de `exileum/meta-mcp` e mantém a cobertura da API oficial da Meta, adicionando uma política de segurança server-side para uso pela Acellere.

## Estado inicial

O servidor inicia em **somente leitura**, mesmo que um cliente MCP tente chamar uma ferramenta de escrita.

```env
ACELLERE_WRITE_MODE=read-only
ACELLERE_ALLOW_DESTRUCTIVE=false
```

As `ToolAnnotations` do MCP continuam sendo usadas para indicar ao cliente se uma ferramenta é leitura, escrita ou destrutiva, mas são apenas metadados. O fork Acellere também bloqueia a requisição no servidor antes que ela chegue à API da Meta.

## Matriz das 33 ferramentas de Instagram

| Grupo | Leitura | Escrita | Destrutiva | Total |
|---|---:|---:|---:|---:|
| Publishing | 1 | 5 | 0 | 6 |
| Media | 3 | 1 | 1 | 5 |
| Comments | 3 | 3 | 1 | 7 |
| Profile & Insights | 4 | 1 | 0 | 5 |
| Hashtags | 4 | 0 | 0 | 4 |
| Mentions & Tags | 2 | 0 | 0 | 2 |
| Messaging | 3 | 1 | 0 | 4 |
| **Total** | **20** | **11** | **2** | **33** |

### Leitura — liberadas no modo inicial

- `ig_get_container_status`
- `ig_get_media_list`
- `ig_get_media`
- `ig_get_media_insights`
- `ig_get_comments`
- `ig_get_comment`
- `ig_get_replies`
- `ig_get_profile`
- `ig_get_account_insights`
- `ig_business_discovery`
- `ig_get_collaboration_invites`
- `ig_search_hashtag`
- `ig_get_hashtag`
- `ig_get_hashtag_recent`
- `ig_get_hashtag_top`
- `ig_get_mentioned_comment`
- `ig_get_tagged_media`
- `ig_get_conversations`
- `ig_get_messages`
- `ig_get_message`

### Escrita — bloqueadas até opt-in explícito

- `ig_publish_photo`
- `ig_publish_video` (deprecated; preferir `ig_publish_reel`)
- `ig_publish_carousel`
- `ig_publish_reel`
- `ig_publish_story`
- `ig_toggle_comments`
- `ig_post_comment`
- `ig_reply_to_comment`
- `ig_hide_comment`
- `ig_respond_collaboration_invite`
- `ig_send_message`

Para habilitar essas ações:

```env
ACELLERE_WRITE_MODE=write
```

### Destrutivas — segundo bloqueio obrigatório

- `ig_delete_media`
- `ig_delete_comment`

Mesmo com `ACELLERE_WRITE_MODE=write`, DELETE continua bloqueado. Para uma operação destrutiva previamente aprovada:

```env
ACELLERE_ALLOW_DESTRUCTIVE=true
```

Depois da operação, retornar para `false`.

## Credenciais mínimas para o primeiro teste

O primeiro teste deve usar apenas uma conta Instagram **Business ou Creator** administrada pela própria equipe.

```env
INSTAGRAM_ACCESS_TOKEN=...
INSTAGRAM_USER_ID=...
FACEBOOK_PAGE_ID=... # Obrigatório para ig_get_conversations em INSTAGRAM_API_MODE=facebook-login
INSTAGRAM_API_MODE=facebook-login
ACELLERE_WRITE_MODE=read-only
ACELLERE_ALLOW_DESTRUCTIVE=false
```

Não adicionar credenciais reais ao GitHub. Usar secrets/variáveis do ambiente onde o MCP for executado.

## Permissões Meta por capacidade

A nomenclatura exata depende do caminho de autenticação (Facebook Login ou Instagram Login), mas as capacidades do servidor se agrupam assim:

| Capacidade | Permissão típica (Facebook Login / Instagram Login) | Contexto / ID Requerido |
|---|---|---|
| perfil e mídia | `instagram_basic` / `instagram_business_basic` | Instagram Account ID (`INSTAGRAM_USER_ID`) |
| publicação | `instagram_content_publish` / `instagram_business_content_publish` | Instagram Account ID (`INSTAGRAM_USER_ID`) |
| comentários | `instagram_manage_comments` / `instagram_business_manage_comments` | Instagram Account ID (`INSTAGRAM_USER_ID`) |
| insights | `instagram_manage_insights` / `instagram_business_manage_insights` | Instagram Account ID (`INSTAGRAM_USER_ID`) |
| Direct (conversas) | `instagram_manage_messages` + `pages_manage_metadata` / `instagram_business_manage_messages` | Facebook Page ID (`FACEBOOK_PAGE_ID`) no Facebook Login / IG User ID no Instagram Login |
| Direct (mensagens) | `instagram_manage_messages` / `instagram_business_manage_messages` | Message ID / Conversation ID |
| exclusão de mídia | `instagram_manage_contents` quando suportado pelo caminho de autenticação | Media ID |

Hashtag discovery, Business Discovery e determinadas superfícies públicas têm requisitos adicionais da Meta e devem ser validadas no app real antes de serem tratadas como disponíveis em produção.

## Ordem recomendada de validação

1. Subir o MCP em `read-only`.
2. Validar `ig_get_profile`.
3. Validar `ig_get_media_list` e `ig_get_media`.
4. Validar `ig_get_account_insights` e `ig_get_media_insights`.
5. Testar `ig_business_discovery` e hashtags.
6. Testar comentários em leitura.
7. Testar Direct em leitura.
8. Somente depois habilitar `ACELLERE_WRITE_MODE=write` em ambiente controlado.
9. Publicar um conteúdo de teste.
10. Validar resposta de comentário/DM.
11. Manter ações destrutivas desativadas por padrão.

## Transporte MCP

Local:

```env
MCP_TRANSPORT=stdio
```

Streamable HTTP:

```env
MCP_TRANSPORT=http
MCP_HTTP_PORT=3000
MCP_HTTP_HOST=127.0.0.1
```

O servidor upstream não fornece autenticação própria para a porta HTTP. Não expor `0.0.0.0:3000` diretamente à internet. Para acesso remoto, usar uma camada autenticada/TLS ou túnel MCP seguro.

## Upstream

Base original: `exileum/meta-mcp`.

O histórico foi preservado para facilitar comparação e sincronização com atualizações futuras do upstream. Alterações específicas da Acellere devem permanecer pequenas e isoladas sempre que possível.
