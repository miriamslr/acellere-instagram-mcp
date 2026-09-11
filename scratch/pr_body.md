## Resumo das Alterações

Este PR implementa a **cobertura integral da superfície pública e oficialmente suportada da Instagram Graph API v26.0** no Acellere Instagram MCP, suportando nativamente tanto **Instagram API with Facebook Login** quanto **Instagram API with Instagram Login** (Leitura e Escrita), com 120 ferramentas MCP registradas e **1.094 testes unitários e de contrato passando em 54 arquivos**.

---

### 🛡️ Remediações da Terceira Auditoria Técnica (Issue #40 e Issue #29)

1. **Resumable Upload com Semântica de Offset Real**:
   - Para `video_url`: quando `offset === 0`, aceita HTTP 200 ou 206. Quando `offset > 0`, envia header `Range: bytes=${offset}-`, exige HTTP 206 Partial Content, rejeita qualquer servidor de origem que retorne HTTP 200 (Range ignorado), valida estritamente o header `Content-Range: bytes START-END/TOTAL` (com `START === offset`, `END >= START` e `TOTAL > 0`), envia o `fileSize` total para a Meta e faz stream do chunk parcial.
   - Para `video_base64`: faz slice do buffer a partir do `offset` (`buffer.subarray(offset)`) e envia o `fileSize` total original para a Meta. Rejeita se `offset > fileSize`.
2. **Preflight de Segurança de Memória (Base64)**:
   - `decodeVideoBase64Preflight` calcula o tamanho decodificado a partir do comprimento da string antes de invocar `atob()`.
   - Se o tamanho estimado exceder 8 MB, rejeita imediatamente com erro descritivo sem alocar a string decodificada na memória nem chamar `atob()`.
3. **Webhook com Idempotência Forte via Cloudflare Durable Object**:
   - Implementada a classe `InstagramWebhookDeduplicatorDO` (`src/services/webhook-deduplicator-do.ts`) com controle atômico transacional check-and-set em 2 fases (pending / delivered / releasePending).
   - Registrado o binding `WEBHOOK_DEDUPLICATOR_DO` e migração `v1` no `wrangler.jsonc`.
4. **Event Sink Real com Sanitização Estrita de Credenciais**:
   - Implementado `CloudflareQueueWebhookEventSink` (`src/services/webhook-normalizer.ts`) com envio assíncrono para fila Cloudflare (`WEBHOOK_QUEUE` -> `instagram-webhooks`).
   - Sanitização automatizada via `sanitizeWebhookEvent` removendo chaves sensíveis (`access_token`, `AUTH_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `META_APP_SECRET`, `Authorization`, `appsecret_proof`, `client_secret`).
5. **Semântica Correta de ACK do Webhook**:
   - Evento novo + enfileiramento OK -> retorna HTTP 200 e confirma entrega no DO.
   - Evento novo + falha de enfileiramento -> executa rollback do estado `pending` no DO e retorna HTTP 500 para permitir retentativa imediata da Meta.
   - Duplicatas e replays fora da janela -> ignorados com status 200 para evitar loops.
6. **Paridade de Modo de Login**:
   - Fallback de `INSTAGRAM_API_MODE` alinhado para `"facebook-login"` em todos os runtimes (Worker, CLI, HTTP local e sandbox).
7. **Consolidação de Capacidades**:
   - Denominador oficial fixado em **72 capacidades oficiais da Meta**, 2 capacidades internas de orquestração (`mcp_internal`) e 6 extensões de inteligência Acellere = **80 capacidades totais**.

---

### 📦 Escopo das Ferramentas MCP Registradas (120 Tools)

1. **Meta Platform Core & Auth (6 tools)**: `meta_exchange_token`, `meta_refresh_token`, `meta_debug_token`, `meta_get_app_info`, `meta_subscribe_webhook`, `meta_get_webhook_subscriptions`.
2. **Instagram Auth & Discovery (3 tools)**: `ig_get_capabilities`, `ig_get_connection_info`, `ig_bootstrap_discovery`.
3. **Instagram Publishing & Upload (10 tools)**: `ig_publish_photo`, `ig_publish_video` [DEPRECATED], `ig_publish_carousel`, `ig_publish_reel`, `ig_publish_story`, `ig_get_container_status`, `ig_get_content_publishing_limit`, `ig_create_resumable_upload_session`, `ig_upload_resumable_binary`, `ig_publish_resumable_video`.
4. **Instagram Media & Stories (7 tools)**: `ig_get_media_list`, `ig_get_media`, `ig_delete_media`, `ig_get_media_insights`, `ig_toggle_comments`, `ig_get_media_children`, `ig_get_stories`, `ig_get_live_media`.
5. **Instagram Comments & Private Replies (6 tools)**: `ig_get_comments`, `ig_get_comment`, `ig_post_comment`, `ig_get_replies`, `ig_reply_to_comment`, `ig_hide_comment`, `ig_delete_comment`, `ig_send_private_reply`.
6. **Instagram Profile, Insights & Publishing Limits (4 tools)**: `ig_get_profile`, `ig_get_account_insights`, `ig_get_user_insights`, `ig_get_user_publishing_limit`.
7. **Business Discovery & Competitor Intelligence (6 tools)**: `ig_business_discovery`, `ig_get_business_media`, `ig_analyze_business`, `ig_compare_businesses`, `ig_track_business`, `ig_untrack_business`, `ig_get_tracked_businesses`, `ig_get_competitor_history`, `ig_run_competitor_collection`, `ig_competitor_research`.
8. **Hashtags & Mentions (8 tools)**: `ig_search_hashtag`, `ig_get_hashtag_info`, `ig_get_hashtag_recent_media`, `ig_get_hashtag_top_media`, `ig_get_user_tags`, `ig_get_user_mentions`, `ig_get_mentioned_comment`, `ig_reply_to_mention`.
9. **Direct Messaging & Send API (15 tools)**: `ig_get_conversations`, `ig_get_conversation_messages`, `ig_send_message`, `ig_send_media_message`, `ig_send_sticker`, `ig_send_published_post`, `ig_send_quick_replies`, `ig_send_generic_template`, `ig_send_button_template`, `ig_send_reaction`, `ig_delete_reaction`, `ig_send_sender_action`, `ig_upload_attachment`, `ig_take_thread_control`, `ig_pass_thread_control`, `ig_request_thread_control`, `ig_get_thread_control_status`.
10. **Messenger Profile & Automation (7 tools)**: `ig_get_ice_breakers`, `ig_set_ice_breakers`, `ig_delete_ice_breakers`, `ig_get_persistent_menu`, `ig_set_persistent_menu`, `ig_delete_persistent_menu`, `ig_get_welcome_message_flow`, `ig_set_welcome_message_flow`, `ig_delete_welcome_message_flow`.
11. **Webhooks End-to-End (4 tools)**: `ig_subscribe_app`, `ig_get_subscribed_apps`, `ig_unsubscribe_app`, `ig_simulate_webhook_event`.
12. **Instagram Commerce & Product Tagging (6 tools)**: `ig_get_product_tags`, `ig_create_product_tags`, `ig_delete_product_tags`, `ig_get_merchant_catalogs`, `ig_check_product_appeal_status`, `ig_submit_product_appeal`.
13. **Instagram Branded Content & Partnership Ads (5 tools)**: `ig_get_branded_content_creators`, `ig_set_authorized_ad_account`, `ig_delete_authorized_ad_account`, `ig_get_tag_approval_settings`, `ig_update_tag_approval`, `ig_respond_collaboration_invite`.
14. **Instagram oEmbed (1 tool)**: `ig_get_oembed_info`.
15. **Threads API (21 tools)**: Publicação, mídia, respostas, perfil, insights e menções do Threads.

---

### 🧪 Checklist de Qualidade e Validação

- [x] `npm run lint` — 0 erros, 0 warnings.
- [x] `npm run typecheck` — 0 erros de TypeScript.
- [x] `npm test` — 54 arquivos de teste, 1.094 testes passando (100% verde).
- [x] `npm run build` — Build executado com sucesso gerando bundles TypeScript e Worker.
- [x] Matriz de capabilities atualizada e formatada em `docs/instagram-api-coverage.md`.
- [x] Documentação e catálogo de ferramentas atualizados no `README.md` e `CHANGELOG.md`.
- [x] Branch protegida: desenvolvimento realizado exclusivamente na branch `feat/full-instagram-api-coverage`.
