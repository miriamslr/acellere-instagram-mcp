# Instagram API 100% Coverage Matrix — Acellere Instagram MCP

> **Status da Matriz**: 100% COMPLETO  
> **Data de Verificação**: 26 de Agosto de 2026  
> **Versão da Meta Graph API Suportada**: `v24.0` – `v26.0`  
> **Modos de Autenticação Suportados**: Instagram API with Facebook Login & Instagram API with Instagram Login

---

## 1. Visão Geral da Arquitetura de Cobertura

O **Acellere Instagram MCP** fornece uma cobertura completa de toda a superfície pública e oficialmente documentada da Instagram Platform da Meta.

A plataforma opera com um **Capability Guard Gateway** centralizado (`src/instagram/capabilities.ts`), garantindo validação de modo antes de qualquer chamada HTTP para a Meta:

- **Instagram API with Facebook Login** (`graph.facebook.com`): Modo corporativo com acesso a todas as capacidades, incluindo Business Discovery concorrencial, Hashtag Search, Commerce Catalog Tagging, Branded Content / Partnership Ads e Webhooks em nível de página.
- **Instagram API with Instagram Login** (`graph.instagram.com`): Modo simplificado focado em criadores individuais, publicações diretas, insights básicos e Direct Messaging.

---

## 2. Matriz Completa de Capacidades e Ferramentas

| ID da Capacidade | Categoria | Endpoint da Meta | Método | Facebook Login | Instagram Login | Ferramenta MCP | Status | Permissões Requeridas |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :---: | :--- |
| `auth.capabilities` | Auth | In-process Gateway | GET | ✅ | ✅ | `ig_get_capabilities` | `COVERED` | — |
| `auth.connectionInfo` | Auth | In-process Gateway | GET | ✅ | ✅ | `ig_get_connection_info` | `COVERED` | — |
| `auth.bootstrapDiscovery` | Auth | `/me/accounts` ou `/me` | GET | ✅ | ✅ | `ig_bootstrap_discovery` | `COVERED` | `pages_show_list,instagram_basic` |
| `profile.me` | Profile | `/{ig-user-id}` | GET | ✅ | ✅ | `ig_get_profile` | `COVERED` | `instagram_basic,instagram_business_basic` |
| `profile.insights` | Insights | `/{ig-user-id}/insights` | GET | ✅ | ✅ | `ig_get_account_insights` | `COVERED` | `instagram_manage_insights` |
| `publishing.photo` | Publishing | `/{ig-user-id}/media` + `/media_publish` | POST | ✅ | ✅ | `ig_publish_photo` | `COVERED` | `instagram_content_publish` |
| `publishing.video` | Publishing | `/{ig-user-id}/media` + `/media_publish` | POST | ✅ | ✅ | `ig_publish_video` | `COVERED` | `instagram_content_publish` |
| `publishing.carousel` | Publishing | `/{ig-user-id}/media` + `/media_publish` | POST | ✅ | ✅ | `ig_publish_carousel` | `COVERED` | `instagram_content_publish` |
| `publishing.reels` | Publishing | `/{ig-user-id}/media` + `/media_publish` | POST | ✅ | ✅ | `ig_publish_reel` | `COVERED` | `instagram_content_publish` |
| `publishing.stories` | Publishing | `/{ig-user-id}/media` + `/media_publish` | POST | ✅ | ✅ | `ig_publish_story` | `COVERED` | `instagram_content_publish` |
| `publishing.limits` | Publishing | `/{ig-user-id}/content_publishing_limit` | GET | ✅ | ✅ | `ig_get_content_publishing_limit` | `COVERED` | `instagram_content_publish` |
| `media.list` | Media | `/{ig-user-id}/media` | GET | ✅ | ✅ | `ig_get_media_list` | `COVERED` | `instagram_basic` |
| `media.get` | Media | `/{ig-media-id}` | GET | ✅ | ✅ | `ig_get_media` | `COVERED` | `instagram_basic` |
| `media.children` | Media | `/{ig-media-id}/children` | GET | ✅ | ✅ | `ig_get_media_children` | `COVERED` | `instagram_basic` |
| `media.stories` | Media | `/{ig-user-id}/stories` | GET | ✅ | ✅ | `ig_get_stories` | `COVERED` | `instagram_basic,instagram_manage_insights` |
| `media.live` | Media | `/{ig-user-id}/live_media` | GET | ✅ | ✅ | `ig_get_live_media` | `COVERED` | `instagram_basic` |
| `media.delete` | Media | `/{ig-media-id}` | DELETE | ✅ | ❌ | `ig_delete_media` | `FACEBOOK_LOGIN_ONLY` | `instagram_manage_contents` |
| `media.insights` | Insights | `/{ig-media-id}/insights` | GET | ✅ | ✅ | `ig_get_media_insights` | `COVERED` | `instagram_manage_insights` |
| `comments.list` | Comments | `/{ig-media-id}/comments` | GET | ✅ | ✅ | `ig_get_comments` | `COVERED` | `instagram_manage_comments` |
| `comments.get` | Comments | `/{ig-comment-id}` | GET | ✅ | ✅ | `ig_get_comment` | `COVERED` | `instagram_manage_comments` |
| `comments.create` | Comments | `/{ig-media-id}/comments` | POST | ✅ | ✅ | `ig_post_comment` | `COVERED` | `instagram_manage_comments` |
| `comments.replies` | Comments | `/{ig-comment-id}/replies` | GET | ✅ | ✅ | `ig_get_replies` | `COVERED` | `instagram_manage_comments` |
| `comments.reply` | Comments | `/{ig-comment-id}/replies` | POST | ✅ | ✅ | `ig_reply_to_comment` | `COVERED` | `instagram_manage_comments` |
| `comments.hide` | Comments | `/{ig-comment-id}` | POST | ✅ | ✅ | `ig_hide_comment` | `COVERED` | `instagram_manage_comments` |
| `comments.delete` | Comments | `/{ig-comment-id}` | DELETE | ✅ | ✅ | `ig_delete_comment` | `COVERED` | `instagram_manage_comments` |
| `comments.toggle` | Comments | `/{ig-media-id}` | POST | ✅ | ✅ | `ig_toggle_comments` | `COVERED` | `instagram_manage_comments` |
| `comments.privateReply` | Comments | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_private_reply` | `COVERED` | `instagram_manage_messages,instagram_manage_comments` |
| `hashtags.search` | Hashtags | `/ig_hashtag_search` | GET | ✅ | ❌ | `ig_search_hashtag` | `FACEBOOK_LOGIN_ONLY` | `instagram_basic,instagram_business_basic` |
| `hashtags.info` | Hashtags | `/{ig-hashtag-id}` | GET | ✅ | ❌ | `ig_get_hashtag` | `FACEBOOK_LOGIN_ONLY` | `instagram_basic,instagram_business_basic` |
| `hashtags.recent` | Hashtags | `/{ig-hashtag-id}/recent_media` | GET | ✅ | ❌ | `ig_get_hashtag_recent` | `FACEBOOK_LOGIN_ONLY` | `instagram_basic,instagram_business_basic` |
| `hashtags.top` | Hashtags | `/{ig-hashtag-id}/top_media` | GET | ✅ | ❌ | `ig_get_hashtag_top` | `FACEBOOK_LOGIN_ONLY` | `instagram_basic,instagram_business_basic` |
| `hashtags.recentlySearched` | Hashtags | `/{ig-user-id}/recently_searched_hashtags` | GET | ✅ | ❌ | `ig_get_recently_searched_hashtags` | `FACEBOOK_LOGIN_ONLY` | `instagram_basic,instagram_business_basic` |
| `mentions.comment` | Mentions | `/{ig-user-id}/mentioned_comment` | GET | ✅ | ✅ | `ig_get_mentioned_comment` | `COVERED` | `instagram_manage_comments` |
| `mentions.media` | Mentions | `/{ig-user-id}/mentioned_media` | GET | ✅ | ✅ | `ig_get_mentioned_media` | `COVERED` | `instagram_manage_comments` |
| `mentions.tags` | Mentions | `/{ig-user-id}/tags` | GET | ✅ | ✅ | `ig_get_tagged_media` | `COVERED` | `instagram_basic` |
| `mentions.reply` | Mentions | `/{ig-user-id}/mentions` | POST | ✅ | ✅ | `ig_reply_to_mention` | `COVERED` | `instagram_manage_comments` |
| `collaboration.invites` | Collaboration | `/{ig-user-id}/collaboration_invites` | GET | ✅ | ✅ | `ig_get_collaboration_invites` | `COVERED` | `instagram_basic` |
| `collaboration.respond` | Collaboration | `/{ig-user-id}/collaboration_invites` | POST | ✅ | ✅ | `ig_respond_collaboration_invite` | `COVERED` | `instagram_content_publish` |
| `collaboration.posts` | Collaboration | `/{ig-user-id}/collaborative_posts` | GET | ✅ | ✅ | `ig_get_collaborative_posts` | `COVERED` | `instagram_basic` |
| `messaging.conversations` | Messaging | `/{target}/conversations` | GET | ✅ | ✅ | `ig_get_conversations` | `COVERED` | `instagram_manage_messages` |
| `messaging.messages` | Messaging | `/{conversation-id}/messages` | GET | ✅ | ✅ | `ig_get_messages` | `COVERED` | `instagram_manage_messages` |
| `messaging.message` | Messaging | `/{message-id}` | GET | ✅ | ✅ | `ig_get_message` | `COVERED` | `instagram_manage_messages` |
| `messaging.sendText` | Messaging | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_message` | `COVERED` | `instagram_manage_messages` |
| `messaging.sendMedia` | Messaging | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_media_message` | `COVERED` | `instagram_manage_messages` |
| `messaging.quickReplies` | Messaging | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_quick_replies` | `COVERED` | `instagram_manage_messages` |
| `messaging.genericTemplate` | Messaging | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_generic_template` | `COVERED` | `instagram_manage_messages` |
| `messaging.buttonTemplate` | Messaging | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_button_template` | `COVERED` | `instagram_manage_messages` |
| `messaging.reactions` | Messaging | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_reaction`, `ig_delete_reaction` | `COVERED` | `instagram_manage_messages` |
| `messaging.senderAction` | Messaging | `/{ig-user-id}/messages` | POST | ✅ | ✅ | `ig_send_sender_action` | `COVERED` | `instagram_manage_messages` |
| `messaging.userProfile` | Messaging | `/{igsid}` | GET | ✅ | ✅ | `ig_get_user_profile_by_igsid` | `COVERED` | `instagram_manage_messages` |
| `messaging.attachments` | Messaging | `/{ig-user-id}/message_attachments` | POST | ✅ | ✅ | `ig_upload_attachment` | `COVERED` | `instagram_manage_messages` |
| `messengerProfile.get` | Messenger Profile | `/{ig-user-id}/messenger_profile` | GET | ✅ | ✅ | `ig_get_messenger_profile` | `COVERED` | `instagram_manage_messages` |
| `messengerProfile.iceBreakers` | Messenger Profile | `/{ig-user-id}/messenger_profile` | POST/DELETE | ✅ | ✅ | `ig_set_ice_breakers`, `ig_delete_ice_breakers` | `COVERED` | `instagram_manage_messages` |
| `messengerProfile.persistentMenu` | Messenger Profile | `/{ig-user-id}/messenger_profile` | POST/DELETE | ✅ | ✅ | `ig_set_persistent_menu`, `ig_delete_persistent_menu` | `COVERED` | `instagram_manage_messages` |
| `messengerProfile.welcomeFlows` | Welcome Flows | `/{ig-user-id}/welcome_message_flows` | GET/POST/DELETE | ✅ | ✅ | `ig_list_welcome_message_flows`, `ig_get_welcome_message_flow`, `ig_set_welcome_message_flow`, `ig_delete_welcome_message_flow` | `COVERED` | `instagram_manage_messages` |
| `webhooks.subscriptions` | Webhooks | `/{target}/subscribed_apps` | GET/POST/DELETE | ✅ | ✅ | `ig_get_subscribed_apps`, `ig_subscribe_app`, `ig_unsubscribe_app` | `COVERED` | `pages_manage_metadata,instagram_manage_messages` |
| `commerce.catalogs` | Commerce | `/{ig-user-id}/available_catalogs` | GET | ✅ | ❌ | `ig_get_available_catalogs`, `ig_get_catalog_products` | `FACEBOOK_LOGIN_ONLY` | `instagram_shopping_tag_products,catalog_management` |
| `commerce.productTags` | Commerce | `/{ig-media-id}/product_tags` | GET/POST/DELETE | ✅ | ❌ | `ig_get_product_tags`, `ig_create_product_tags`, `ig_delete_product_tags` | `FACEBOOK_LOGIN_ONLY` | `instagram_shopping_tag_products` |
| `commerce.productAppeal` | Commerce | `/{ig-user-id}/product_appeal` | GET/POST | ✅ | ❌ | `ig_get_product_appeal`, `ig_submit_product_appeal` | `FACEBOOK_LOGIN_ONLY` | `instagram_shopping_tag_products` |
| `partnership.adPermissions` | Partnership | `/{ig-media-id}/branded_content_ad_permissions` | GET | ✅ | ❌ | `ig_get_branded_content_ad_permissions` | `FACEBOOK_LOGIN_ONLY` | `instagram_branded_content_ads_brand,ads_management` |
| `partnership.advertisableMedia` | Partnership | `/{ig-user-id}/branded_content_advertisable_medias` | GET | ✅ | ❌ | `ig_get_advertisable_media` | `FACEBOOK_LOGIN_ONLY` | `instagram_branded_content_ads_brand,ads_management` |
| `partnership.authorizedPartners` | Partnership | `/{ig-user-id}/branded_content_ad_partners` | GET/POST/DELETE | ✅ | ❌ | `ig_get_authorized_ad_accounts`, `ig_set_authorized_ad_account`, `ig_delete_authorized_ad_account` | `FACEBOOK_LOGIN_ONLY` | `instagram_branded_content_ads_brand,ads_management` |
| `partnership.tagApproval` | Partnership | `/{ig-user-id}/branded_content_tag_approval` | GET/POST | ✅ | ❌ | `ig_get_tag_approval_requests`, `ig_update_tag_approval` | `FACEBOOK_LOGIN_ONLY` | `instagram_branded_content_brand` |
| `discovery.profile` | Business Discovery | `/{ig-user-id}?fields=business_discovery.username(...)` | GET | ✅ | ❌ | `ig_business_discovery`, `ig_get_business_media` | `FACEBOOK_LOGIN_ONLY` | `instagram_basic,instagram_business_basic` |
| `discovery.analytics` | Competitive Intel | Local Engine + Discovery API | GET | ✅ | ❌ | `ig_analyze_business`, `ig_compare_businesses`, `ig_track_business`, `ig_get_business_history`, `ig_competitor_research` | `FACEBOOK_LOGIN_ONLY` | `instagram_basic,instagram_business_basic` |
| `oembed.post` | oEmbed | `/instagram_oembed` | GET | ✅ | ✅ | `ig_get_oembed` | `COVERED` | `oEmbed Read Product` |

---

## 3. Classificação de Estados Oficiais

Conforme as diretrizes arquiteturais da Acellere:
1. `COVERED`: Implementado diretamente com ferramenta MCP nativa disponível em ambos os modos ou com suporte universal.
2. `COVERED_BY_ABSTRACTION`: Capacidade atendida por camadas compostas de agregação analítica (e.g. tracking de concorrência, métricas derivadas de engajamento).
3. `FACEBOOK_LOGIN_ONLY`: Recurso exposto pela Meta exclusivamente via Facebook Login (`graph.facebook.com`), com bloqueio prévio amigável (Capability Guard) se invocado sob Instagram Login.
4. `INSTAGRAM_LOGIN_ONLY`: Recurso específico do fluxo direto de criadores do Instagram.
5. `DEPRECATED`: Recursos aposentados pela Meta (e.g., `impressions`, `video_views`, `email_contacts` na v22.0) devidamente migrados para `views`, `reach` e `follower_count`.
6. `NOT_EXPOSED_BY_META`: Ações privadas não disponibilizadas pela Graph API pública.

Nenhum recurso está em estado `UNKNOWN` ou `TODO` sem issue.
