## 🛡️ Relatório de Remediação da Segunda Auditoria Técnica — PR #39

Todas as inconformidades e bloqueadores apontados na **Segunda Auditoria Técnica Independente** (registrados na Issue #40) foram completamente corrigidos e validados com **1.058 testes passando**, 0 erros de linter e 0 erros de tipagem TypeScript.

---

### 📋 Itens Corrigidos Ponto a Ponto

1. **Resumable Upload Completo (`rupload.facebook.com`)**:
   - ✅ Implementada a tool `ig_upload_resumable_binary` que realiza a transferência binária direta via stream HTTP POST para o endpoint `rupload.facebook.com` com cabeçalhos exigidos pela Meta (`Authorization: OAuth <token>`, `offset`, `file_size`, `X-Entity-Length`, `Content-Type: application/octet-stream`).
   - ✅ Implementada a tool orquestradora `ig_publish_resumable_video` que executa todo o ciclo de vida do Resumable Upload (criação de sessão `upload_type=resumable` -> streaming binário -> polling de processamento do container com notificação de progresso MCP -> publicação final `media_publish` -> invalidação de cache).
   - ✅ Adicionado getter `igAccessToken` em `MetaClient` para expor o token Instagram para ferramentas de transferência binária.
   - ✅ Corrigido status de `publishing.resumableUpload` na matriz de capabilities (`src/instagram/capabilities.ts` e `docs/instagram-api-coverage.md`) para `FACEBOOK_LOGIN_ONLY` (`facebookLogin: true`, `instagramLogin: false`), conforme documentação oficial da Meta.

2. **Quick Replies de Telefone e E-mail com `title`, `payload` e `image_url`**:
   - ✅ Atualizado schema Zod em `ig_send_quick_replies` (`src/tools/instagram/messaging.ts`) para suportar campos opcionais `title`, `payload` e `image_url` para `user_phone_number` e `user_email`, alinhando à especificação oficial da Meta.

3. **Generic Template com `default_action`**:
   - ✅ Adicionado o objeto `default_action` (`web_url`, `url`, `webview_height_ratio`, `messenger_extensions`, `fallback_url`) aos cards de `ig_send_generic_template` (`src/tools/instagram/messaging.ts`).

4. **Replay Protection Ativo no Runtime**:
   - ✅ `DefaultWebhookEventSink.dispatch()` agora invoca ativamente `isTimestampWithinReplayWindow(event.timestamp)` antes de processar ou despachar qualquer evento, descartando replays antigos ou timestamps no futuro e contabilizando a métrica `ignoredReplays`.
   - ✅ Endpoint do Cloudflare Worker (`/webhooks/instagram`) retorna no payload de resposta HTTP as métricas completas: `dispatched`, `ignored_duplicates` e `ignored_replays`.

5. **Tratamento do Webhook `message_edited`**:
   - ✅ Adicionado o evento normalizado `message_edited` em `normalizeInstagramWebhook()` para capturar tanto o objeto `entry.messaging[].message_edit` quanto o contador `msg.message.num_edit`.

6. **Preservação de Campos Oficiais de Mensagem**:
   - ✅ `normalizeInstagramWebhook()` agora preserva integralmente os campos oficiais `is_deleted`, `is_self`, `is_unsupported`, `referral`, `commands` e `shares`.

7. **Tratamento de Comments Webhook nos Dois Formatos Oficiais**:
   - ✅ `normalizeInstagramWebhook()` suporta tanto o **Formato 1** (`entry.changes[]`) quanto o **Formato 2** (`entry.field` & `entry.value` diretos no objeto raiz de `entry`).

8. **Deduplicação Persistente com Suporte a KV e Métrica Determinística de Capabilities**:
   - ✅ Criada a interface `WebhookEventDeduplicator` com as implementações `InMemoryEventDeduplicator` e `KVEventDeduplicator` (com suporte a Cloudflare `KVNamespace`).
   - ✅ Atualizado `WorkerEnv` com bindings opcionais `KV_DEDUPLICATION` e `CACHE_KV`.
   - ✅ Exportadas constantes determinísticas `OFFICIAL_CAPABILITIES_COUNT` (74) e `ACELLERE_EXTENSIONS_COUNT` (6) em `src/instagram/capabilities.ts`.

---

### 🧪 Evidências de Validação Local

```bash
> @exileum/meta-mcp@8.0.0 lint
> eslint . --max-warnings 0

> @exileum/meta-mcp@8.0.0 typecheck
> tsc --noEmit

> @exileum/meta-mcp@8.0.0 test
> vitest run

 Test Files  53 passed (53)
      Tests  1058 passed (1058)
   Start at  02:16:59
   Duration  8.14s

> @exileum/meta-mcp@8.0.0 build
> tsc
```

- Total de Ferramentas Registradas: **120 tools** (todas tipadas com Zod, anotadas com MCP hints e testadas individualmente).
- Commit de Remediação: `cfe157b` enviado para a branch `feat/full-instagram-api-coverage`.
