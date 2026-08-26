### 🚀 Atualização de Arquitetura de Webhooks — PR #39

A infraestrutura de Webhooks do Instagram foi elevada para o padrão de produção de alta disponibilidade no Cloudflare Workers na branch `feat/full-instagram-api-coverage` (commit `a35503f`), atendendo aos requisitos de confiabilidade e segurança:

---

#### 1. Idempotência Forte com Cloudflare Durable Objects
- Criado o Durable Object `InstagramWebhookDeduplicatorDO` (`src/services/webhook-deduplicator-do.ts`) para controle transacional atômico de eventos.
- **Transação em 2 Fases**:
  - `checkAndSet`: Aquisição de lease atômico (`pending`) com TTL configurável.
  - `markDelivered`: Confirmação definitiva de entrega após enfileiramento bem-sucedido.
  - `releasePending`: Liberação imediata do lock caso ocorra falha no processamento a jusante.
- Bindings declarados no `wrangler.jsonc` (`WEBHOOK_DEDUPLICATOR_DO` + migração `v1`).

#### 2. Event Sink Real com Cloudflare Queues
- Implementado `CloudflareQueueWebhookEventSink` (`src/services/webhook-normalizer.ts`) para desacoplar a recepção síncrona do processamento pesado.
- Fila `WEBHOOK_QUEUE` mapeada para a fila `instagram-webhooks` no `wrangler.jsonc`.

#### 3. Sanitização Total de Credenciais
- Todos os eventos despachados para a fila passam pelo pipeline `sanitizeWebhookEvent`, que remove recursivamente quaisquer chaves sensíveis (`access_token`, `AUTH_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `META_APP_SECRET`, `Authorization`, `appsecret_proof`, `client_secret`).

#### 4. Semântica de ACK e Retentativas da Meta
- **Fluxo com Sucesso**: Validação de HMAC-SHA256 -> Normalização -> DO check-and-set -> Queue send -> DO markDelivered -> HTTP 200 OK.
- **Fluxo com Falha na Fila**: Em caso de indisponibilidade transitória da Queue, o lock `pending` no DO é liberado via `releasePending` e a rota responde HTTP 500 para acionar a retentativa automática da Meta.
- **Proteção contra Replay e Duplicatas**: Validação estrita da janela de timestamp (rejeição de replays) e descarte idempotente de duplicatas sem re-enfileiramento.

---

### 🧪 Validação
- Testes unitários do DO: `src/services/webhook-deduplicator-do.test.ts` (6 testes passando).
- Testes do Event Sink e Sanitização: `src/services/webhook-normalizer.test.ts` (13 testes passando).
- Testes de integração do Worker: `src/worker.test.ts` (13 testes passando).
- Suíte completa: **1.094 testes passando em 54 arquivos**.
