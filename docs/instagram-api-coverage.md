# Instagram Platform API Coverage Matrix — Acellere Instagram MCP

> **Status da Matriz**: 100% da Superfície Pública Oficial Mapeada e Coberta  
> **Data de Verificação**: 26 de Agosto de 2026  
> **Versão da Meta Graph API**: `v24.0` – `v26.0`  
> **Modos de Autenticação**: Instagram API with Facebook Login & Instagram API with Instagram Login

---

## 1. Visão Geral da Arquitetura de Cobertura

O **Acellere Instagram MCP** implementa cobertura integral da superfície pública e oficialmente documentada da Instagram Platform da Meta.

A arquitetura opera com um **Capability Guard Gateway** centralizado (`src/instagram/capabilities.ts`), com validações de login mode, escopos específicos por modo e parâmetros antes de despachar qualquer requisição HTTP à Meta:

- **Instagram API with Facebook Login** (`graph.facebook.com`): Modo corporativo com acesso integral a todas as capacidades profissionais, incluindo Business Discovery de concorrentes, busca de Hashtags e monitoramento de quotas, Commerce Catalog & Product Tagging, Branded Content / Partnership Ads e Webhooks de página.
- **Instagram API with Instagram Login** (`graph.instagram.com`): Modo de criador individual focado em publicação direta, insights de conta e mídia, Direct Messaging / Send API, Messenger Profile e webhooks.

---

## 2. Superfície Oficial da Instagram Platform (Meta Official Surface)

> [!NOTE]
> Esta seção compõe a base matemática do denominador para a declaração de **100% de cobertura da API oficial**. Todas as capacidades pertencem exclusivamente a endpoin| ID da Capacidade | Categoria | Endpoint Oficial da Meta | Método | Facebook Login | Instagram Login | Ferramenta MCP | Permissões (Facebook Login) | Permissões (Instagram Login) | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: |
| `auth.tokenDebug` | Auth | `GET /debug_token` | GET | ✅ | ✅ | `meta_debug_token` | — | — | `COVERED` |
| `auth.tokenExchangeFacebook` | Auth | `GET /oauth/access_token?grant_type=fb_exchange_token` | GET | ✅ | ❌ | `meta_exchange_token` | `pages_show_list,instagram_basic` | — | `FACEBOOK_LOGIN_ONLY` |
| `auth.tokenExchangeInstagram` | Auth | `GET /access_token?grant_type=ig_exchange_token` | GET | ❌ | ✅ | `meta_exchange_token` | — | `instagram_business_basic` | `INSTAGRAM_LOGIN_ONLY` |
| `auth.tokenRefreshInstagram` | Auth | `GET /refresh_access_token?grant_type=ig_refresh_token` | GET | ❌ | ✅ | `meta_refresh_token` | — | `instagram_business_basic` | `INSTAGRAM_LOGIN_ONLY` |
| `auth.appInfo` | Auth | `GET /{app-id}` | GET | ✅ | ✅ | `meta_get_app_info` | — | — | `COVERED` |
| `auth.bootstrapDiscovery` | Auth | `GET /me/accounts` ou `GET /me` | GET | ✅ | ✅ | `ig_bootstrap_discovery` | `pages_show_list,instagram_basic` | `instagram_business_basic` | `COVERED` |discovery` | `pages_show_list,instagram_basic` | `instagram_business_basic` | `COVERED` |
| `profile.me` | Profile | `GET /{ig-user-id}` | GET | ✅ | ✅ | `ig_get_profile` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `profile.insights` | Insights | `GET /{ig-user-id}/insights` | GET | ✅ | ✅ | `ig_get_account_insights` | `instagram_manage_insights` | `instagram_business_manage_insights` | `COVERED` |
| `publishing.photo` | Publishing | `POST /{ig-user-id}/media` + `media_publish` | POST | ✅ | ✅ | `ig_publish_photo` | `instagram_content_publish` | `instagram_business_content_publish` | `COVERED` |
| `publishing.video` | Publishing | `POST /{ig-user-id}/media` (Legacy) | POST | ✅ | ✅ | `ig_publish_video` | `instagram_content_publish` | `instagram_business_content_publish` | `DEPRECATED` |
| `publishing.carousel` | Publishing | `POST /{ig-user-id}/media` + `media_publish` | POST | ✅ | ✅ | `ig_publish_carousel` | `instagram_content_publish` | `instagram_business_content_publish` | `COVERED` |
| `publishing.reels` | Publishing | `POST /{ig-user-id}/media` + `media_publish` | POST | ✅ | ✅ | `ig_publish_reel` | `instagram_content_publish` | `instagram_business_content_publish` | `COVERED` |
| `publishing.stories` | Publishing | `POST /{ig-user-id}/media` + `media_publish` | POST | ✅ | ✅ | `ig_publish_story` | `instagram_content_publish` | `instagram_business_content_publish` | `COVERED` |
| `publishing.containerStatus` | Publishing | `GET /{container-id}` | GET | ✅ | ✅ | `ig_get_container_status` | `instagram_content_publish` | `instagram_business_content_publish` | `COVERED` |
| `publishing.limits` | Publishing | `GET /{ig-user-id}/content_publishing_limit` | GET | ✅ | ✅ | `ig_get_content_publishing_limit` | `instagram_content_publish` | `instagram_business_content_publish` | `COVERED` |
| `publishing.resumableUpload` | Publishing | `POST /{ig-user-id}/media?upload_type=resumable` + `POST https://rupload.facebook.com/ig-api-upload/` | POST | ✅ | ❌ | `ig_create_resumable_upload_session`, `ig_upload_resumable_binary`, `ig_publish_resumable_video` | `instagram_content_publish` | — | `FACEBOOK_LOGIN_ONLY` |
| `media.list` | Media | `GET /{ig-user-id}/media` | GET | ✅ | ✅ | `ig_get_media_list` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `media.get` | Media | `GET /{ig-media-id}` | GET | ✅ | ✅ | `ig_get_media` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `media.children` | Media | `GET /{ig-media-id}/children` | GET | ✅ | ✅ | `ig_get_media_children` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `media.stories` | Media | `GET /{ig-user-id}/stories` | GET | ✅ | ✅ | `ig_get_stories` | `instagram_basic,instagram_manage_insights` | `instagram_business_basic,instagram_business_manage_insights` | `COVERED` |
| `media.live` | Media | `GET /{ig-user-id}/live_media` | GET | ✅ | ✅ | `ig_get_live_media` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `media.delete` | Media | `DELETE /{ig-media-id}` | DELETE | ✅ | ❌ | `ig_delete_media` | `instagram_manage_contents` | — | `FACEBOOK_LOGIN_ONLY` |
| `media.insights` | Insights | `GET /{ig-media-id}/insights` | GET | ✅ | ✅ | `ig_get_media_insights` | `instagram_manage_insights` | `instagram_business_manage_insights` | `COVERED` |
| `comments.list` | Comments | `GET /{ig-media-id}/comments` | GET | ✅ | ✅ | `ig_get_comments` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.get` | Comments | `GET /{ig-comment-id}` | GET | ✅ | ✅ | `ig_get_comment` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.create` | Comments | `POST /{ig-media-id}/comments` | POST | ✅ | ✅ | `ig_post_comment` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.replies` | Comments | `GET /{ig-comment-id}/replies` | GET | ✅ | ✅ | `ig_get_replies` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.reply` | Comments | `POST /{ig-comment-id}/replies` | POST | ✅ | ✅ | `ig_reply_to_comment` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.hide` | Comments | `POST /{ig-comment-id}?hide=true` | POST | ✅ | ✅ | `ig_hide_comment` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.delete` | Comments | `DELETE /{ig-comment-id}` | DELETE | ✅ | ✅ | `ig_delete_comment` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.toggle` | Comments | `POST /{ig-media-id}?comment_enabled=true` | POST | ✅ | ✅ | `ig_toggle_comments` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `comments.privateReply` | Comments | `POST /{ig-user-id}/messages` (reply comment) | POST | ✅ | ✅ | `ig_send_private_reply` | `instagram_manage_messages,instagram_manage_comments` | `instagram_business_manage_messages,instagram_business_manage_comments` | `COVERED` |
| `hashtags.search` | Hashtags | `GET /ig_hashtag_search?q={name}` | GET | ✅ | ❌ | `ig_search_hashtag` | `instagram_basic` | — | `FACEBOOK_LOGIN_ONLY` |
| `hashtags.info` | Hashtags | `GET /{ig-hashtag-id}` | GET | ✅ | ❌ | `ig_get_hashtag` | `instagram_basic` | — | `FACEBOOK_LOGIN_ONLY` |
| `hashtags.recent` | Hashtags | `GET /{ig-hashtag-id}/recent_media` | GET | ✅ | ❌ | `ig_get_hashtag_recent` | `instagram_basic` | — | `FACEBOOK_LOGIN_ONLY` |
| `hashtags.top` | Hashtags | `GET /{ig-hashtag-id}/top_media` | GET | ✅ | ❌ | `ig_get_hashtag_top` | `instagram_basic` | — | `FACEBOOK_LOGIN_ONLY` |
| `hashtags.recentlySearched` | Hashtags | `GET /{ig-user-id}/recently_searched_hashtags` | GET | ✅ | ❌ | `ig_get_recently_searched_hashtags` | `instagram_basic` | — | `FACEBOOK_LOGIN_ONLY` |
| `mentions.comment` | Mentions | `GET /{ig-user-id}/mentioned_comment` | GET | ✅ | ✅ | `ig_get_mentioned_comment` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `mentions.media` | Mentions | `GET /{ig-user-id}/mentioned_media` | GET | ✅ | ✅ | `ig_get_mentioned_media` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `mentions.tags` | Mentions | `GET /{ig-user-id}/tags` | GET | ✅ | ✅ | `ig_get_tagged_media` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `mentions.reply` | Mentions | `POST /{ig-user-id}/mentions` | POST | ✅ | ✅ | `ig_reply_to_mention` | `instagram_manage_comments` | `instagram_business_manage_comments` | `COVERED` |
| `collaboration.invites` | Collaboration | `GET /{ig-user-id}/collaboration_invites` | GET | ✅ | ✅ | `ig_get_collaboration_invites` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `collaboration.respond` | Collaboration | `POST /{ig-user-id}/collaboration_invites` | POST | ✅ | ✅ | `ig_respond_collaboration_invite` | `instagram_content_publish` | `instagram_business_content_publish` | `COVERED` |
| `collaboration.posts` | Collaboration | `GET /{ig-user-id}/collaborative_posts` | GET | ✅ | ✅ | `ig_get_collaborative_posts` | `instagram_basic` | `instagram_business_basic` | `COVERED` |
| `messaging.conversations` | Messaging | `GET /{target}/conversations` | GET | ✅ | ✅ | `ig_get_conversations` | `instagram_manage_messages,pages_manage_metadata` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.messages` | Messaging | `GET /{conversation-id}/messages` | GET | ✅ | ✅ | `ig_get_messages` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.message` | Messaging | `GET /{message-id}` | GET | ✅ | ✅ | `ig_get_message` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.sendText` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_message` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.sendMedia` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_media_message` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.sendSticker` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_sticker` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.sendPublishedPost` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_published_post` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.quickReplies` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_quick_replies` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.genericTemplate` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_generic_template` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.buttonTemplate` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_button_template` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.reactions` | Messaging | `POST /{ig-user-id}/messages` (sender_action: react/unreact) | POST | ✅ | ✅ | `ig_send_reaction`, `ig_delete_reaction` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.senderAction` | Messaging | `POST /{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_sender_action` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.userProfile` | Messaging | `GET /{igsid}` | GET | ✅ | ✅ | `ig_get_user_profile_by_igsid` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messaging.attachments` | Messaging | `POST /{ig-user-id}/message_attachments` | POST | ✅ | ✅ | `ig_upload_attachment` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messengerProfile.get` | Messenger Profile | `GET /{ig-user-id}/messenger_profile` | GET | ✅ | ✅ | `ig_get_messenger_profile` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messengerProfile.iceBreakers` | Messenger Profile | `POST/DELETE /{ig-user-id}/messenger_profile` | POST | ✅ | ✅ | `ig_set_ice_breakers`, `ig_delete_ice_breakers` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messengerProfile.persistentMenu` | Messenger Profile | `POST/DELETE /{ig-user-id}/messenger_profile` | POST | ✅ | ✅ | `ig_set_persistent_menu`, `ig_delete_persistent_menu` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `messengerProfile.welcomeFlows` | Welcome Flows | `GET/POST/DELETE /{ig-user-id}/welcome_message_flows` | POST | ✅ | ✅ | `ig_list_welcome_message_flows`, `ig_get_welcome_message_flow`, `ig_set_welcome_message_flow`, `ig_delete_welcome_message_flow` | `instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `webhooks.subscriptions` | Webhooks | `GET/POST/DELETE /{target}/subscribed_apps` | POST | ✅ | ✅ | `ig_get_subscribed_apps`, `ig_subscribe_app`, `ig_unsubscribe_app` | `pages_manage_metadata,instagram_manage_messages` | `instagram_business_manage_messages` | `COVERED` |
| `commerce.catalogs` | Commerce | `GET /{ig-user-id}/available_catalogs` | GET | ✅ | ❌ | `ig_get_available_catalogs`, `ig_get_catalog_products` | `instagram_shopping_tag_products,catalog_management` | — | `FACEBOOK_LOGIN_ONLY` |
| `commerce.productTags` | Commerce | `GET/POST/DELETE /{ig-media-id}/product_tags` | POST | ✅ | ❌ | `ig_get_product_tags`, `ig_create_product_tags`, `ig_delete_product_tags` | `instagram_shopping_tag_products` | — | `FACEBOOK_LOGIN_ONLY` |
| `commerce.productAppeal` | Commerce | `GET/POST /{ig-user-id}/product_appeal` | POST | ✅ | ❌ | `ig_get_product_appeal`, `ig_submit_product_appeal` | `instagram_shopping_tag_products` | — | `FACEBOOK_LOGIN_ONLY` |
| `partnership.adPermissions` | Partnership | `GET /{ig-media-id}/branded_content_ad_permissions` | GET | ✅ | ❌ | `ig_get_branded_content_ad_permissions` | `instagram_branded_content_ads_brand,ads_management` | — | `FACEBOOK_LOGIN_ONLY` |
| `partnership.advertisableMedia` | Partnership | `GET /{ig-user-id}/branded_content_advertisable_medias` | GET | ✅ | ❌ | `ig_get_advertisable_media` | `instagram_branded_content_ads_brand,ads_management` | — | `FACEBOOK_LOGIN_ONLY` |
| `partnership.authorizedPartners` | Partnership | `GET/POST/DELETE /{ig-user-id}/branded_content_ad_partners` | POST | ✅ | ❌ | `ig_get_authorized_ad_accounts`, `ig_set_authorized_ad_account`, `ig_delete_authorized_ad_account` | `instagram_branded_content_ads_brand,ads_management` | — | `FACEBOOK_LOGIN_ONLY` |
| `partnership.tagApproval` | Partnership | `GET/POST /{ig-user-id}/branded_content_tag_approval` | POST | ✅ | ❌ | `ig_get_tag_approval_requests`, `ig_update_tag_approval` | `instagram_branded_content_brand` | — | `FACEBOOK_LOGIN_ONLY` |
| `discovery.profile` | Business Discovery | `GET /{ig-user-id}?fields=business_discovery.username(...)` | GET | ✅ | ❌ | `ig_business_discovery`, `ig_get_business_media` | `instagram_basic` | — | `FACEBOOK_LOGIN_ONLY` |
| `oembed.post` | oEmbed | `GET /instagram_oembed` | GET | ✅ | ✅ | `ig_get_oembed` | oEmbed Product | oEmbed Product | `COVERED` |

---

## 3. Utilitários Internos MCP (MCP Internal Surface — `mcp_internal`)

> [!NOTE]
> Estas ferramentas são utilitários operacionais em tempo de execução (`In-process Gateway`) para introspecção do MCP e inspeção de conexão segura sem expor credenciais. Elas pertencem à superfície `mcp_internal` e **não compõem o denominador** de endpoints oficiais da Meta.

| ID da Capacidade | Categoria | Mecanismo | Método | Facebook Login | Instagram Login | Ferramenta MCP | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| `auth.capabilities` | Auth | In-process Gateway | GET | ✅ | ✅ | `ig_get_capabilities` | `COVERED` |
| `auth.connectionInfo` | Auth | In-process Gateway | GET | ✅ | ✅ | `ig_get_connection_info` | `COVERED` |

---

## 4. Acellere Extensions (Ferramentas Analíticas e de Inteligência)

> [!NOTE]
> Estas ferramentas são construções proprietárias da arquitetura Acellere, baseadas no endpoint oficial de Business Discovery e persistência D1/SQLite local. Elas **não** fazem parte da API oficial da Meta e **não compõem o denominador** da métrica oficial de 100%.

| ID da Extensão | Finalidade | Ferramenta MCP | Modo | Tipo | Status |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `extension.analytics` | Análise estatística e determinística de métricas e formatos de concorrentes | `ig_analyze_business` | Facebook Login | READ | `COVERED_BY_ABSTRACTION` |
| `extension.comparison` | Benchmarking comparativo lado a lado de 1 a 10 contas concorrentes | `ig_compare_businesses` | Facebook Login | READ | `COVERED_BY_ABSTRACTION` |
| `extension.tracking` | Registro e monitoramento recorrente de contas concorrentes com snapshots | `ig_track_business`, `ig_untrack_business` | Facebook Login | WRITE_IDEMPOTENT | `COVERED_BY_ABSTRACTION` |
| `extension.history` | Consulta de evolução histórica de seguidores, ritmo de postagens e métricas | `ig_get_business_history` | Local Storage | READ | `COVERED_BY_ABSTRACTION` |
| `extension.collection` | Rotina em lote para atualização de snapshots de todas as contas monitoradas | `ig_run_competitor_collection` | Facebook Login | WRITE_IDEMPOTENT | `COVERED_BY_ABSTRACTION` |
| `extension.research` | Orquestrador completo de pesquisa de mercado pronto para consumo por LLMs | `ig_competitor_research` | Facebook Login | READ | `COVERED_BY_ABSTRACTION` |

---

## 5. Classificação dos Status

1. `COVERED`: Implementação direta de endpoint oficial da Meta Graph API disponível no modo ativo.
2. `COVERED_BY_ABSTRACTION`: Capacidade atendida por agregação analítica estruturada sobre endpoints da Meta e banco local.
3. `FACEBOOK_LOGIN_ONLY`: Recurso exposto pela Meta exclusivamente via Facebook Login (`graph.facebook.com`), com bloqueio prévio amigável (Capability Guard) sob Instagram Login.
4. `INSTAGRAM_LOGIN_ONLY`: Recurso exclusivo do fluxo de Instagram Login (`graph.instagram.com`).
5. `DEPRECATED`: Endpoint depreciado pela Meta com redirecionamento para o fluxo vigente.
