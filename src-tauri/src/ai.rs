use crate::config;
use crate::model::{AiRequest, AiResponse, AiSuggestion, OllamaStatus};
use serde_json::{json, Value};
use tauri::AppHandle;

const CLAUDE_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";

/// Build the system prompt that encodes the curation rules.
fn system_prompt(char_limit: u32, fields: &[String], genres: &[String], strict: bool) -> String {
    let wants = |f: &str| fields.iter().any(|x| x == f);

    let mut rules = String::from(
        "Você é um curador especialista em metadados para DJs de Open Format, com foco \
forte em música latina e brasileira. Recebe um LOTE de faixas (JSON) e devolve sugestões \
de tags. Use SEMPRE como contexto: Título + Artista + tags existentes + nome do arquivo.\n\n\
PRINCÍPIOS GERAIS:\n\
- Considere o LOTE inteiro para manter CONSISTÊNCIA: se vários itens são do mesmo gênero, \
use o MESMO rótulo (constância), para permitir Smart Crates/agrupamento funcional.\n\
- Detecte REMIX/EDIT/BOOTLEG/VIP/MASHUP pelo título e classifique pelo gênero DO REMIX, \
não do original (ex.: \"Safaera (House Bootleg)\" → House; \"Get Lucky (Disclosure Remix)\" \
→ UK Garage/House, não Disco/Pop).\n",
    );

    if wants("genre") {
        rules.push_str(
            "\nGÊNERO (granularidade média-alta, direcionada):\n\
- Para latino/brasileiro seja ESPECÍFICO, evite só \"Latin\"/\"Brazilian\". Vocabulário \
preferencial: Reggaeton Old School, Reggaeton Colombiano, Reggaeton Portorriquenho, \
Dembow, Guaracha, Cumbia, Salsa, Bachata, Merengue, Latin House; e BR: Funk Mandelão, \
Funk 150 BPM, Funk Automotivo, Brega Funk, Pagode, Samba, Forró, Piseiro, Sertanejo, \
Axé, MPB, Tecnobrega.\n\
- Para eletrônico use granularidade média que agrupe faixas parecidas: House, Tech House, \
Afro House, Melodic Techno, UK Garage, etc. — evite microgêneros excessivos.\n",
        );

        if !genres.is_empty() {
            let list = genres.join(", ");
            if strict {
                rules.push_str(&format!(
                    "\nBANCO DE GÊNEROS (MODO ESTRITO): use EXCLUSIVAMENTE um destes rótulos \
no campo `genre`, escolhendo o mais próximo. NÃO invente outros: {list}.\n"
                ));
            } else {
                rules.push_str(&format!(
                    "\nBANCO DE GÊNEROS (preferencial): priorize FORTEMENTE estes rótulos no \
campo `genre`, reutilizando-os para manter consistência. Só proponha um gênero fora da \
lista se nenhum encaixar: {list}.\n"
                ));
            }
        }
    }
    if wants("title") {
        rules.push_str(&format!(
            "\nTÍTULO (padronização):\n\
- Formato OBRIGATÓRIO: \"Título - Artista (Versão)\". Ex.: \"Tití Me Preguntó - Bad Bunny (Club Edit)\".\n\
- Mova Remix/Edit/Bootleg/Mashup/VIP/feat. para dentro dos parênteses (Versão).\n\
- Remova lixo promocional: [Free Download], nomes de blog, URLs, \"Official Video\", \
extensões soltas, espaços duplos.\n\
- Respeite o LIMITE de {char_limit} caracteres no título final (corte sem partir palavra).\n",
            char_limit = char_limit
        ));
    }
    if wants("artist") {
        rules.push_str(
            "\nARTISTA:\n- Normalize o artista principal; remova \"feat.\"/convidados do \
campo artista (eles vão para a Versão do título quando fizer sentido).\n",
        );
    }
    if wants("energy") {
        rules.push_str(
            "\nENERGIA (1 a 5):\n- Deduza o nível de energia da pista: 1 = baixíssima \
(intro/ambient), 3 = média (groove constante), 5 = pico de pista. Retorne apenas o número \
inteiro em `energy`. NÃO escreva energia dentro de `comment` (o app cuida disso).\n",
        );
    }

    rules.push_str(
        "\nMETADADOS DE REFERÊNCIA:\n- Alguns itens trazem um campo `reference` com dados \
externos (Deezer/MusicBrainz). Trate-o como fonte confiável para confirmar artista/título \
e para ano/álbum/BPM; prefira-o a adivinhar, mas mantenha as regras de formatação acima.\n",
    );

    rules.push_str(
        "\nSAÍDA:\n- Devolva uma entrada por faixa, usando o MESMO `id` recebido. Inclua \
APENAS os campos solicitados; se não tiver certeza de um campo, omita-o. Não invente dados \
factuais (ano/álbum).\n",
    );
    rules
}

/// JSON schema for the structured output (shared by Claude tool-use & Ollama format).
fn suggestions_schema(fields: &[String], genres: &[String], strict: bool) -> Value {
    let mut props = serde_json::Map::new();
    props.insert("id".into(), json!({ "type": "string" }));
    if fields.iter().any(|f| f == "title") {
        props.insert("title".into(), json!({ "type": "string" }));
    }
    if fields.iter().any(|f| f == "artist") {
        props.insert("artist".into(), json!({ "type": "string" }));
    }
    if fields.iter().any(|f| f == "genre") {
        // In strict mode with a non-empty bank, constrain genre to an enum so
        // both Claude (tool-use) and Ollama (format) enforce the vocabulary.
        if strict && !genres.is_empty() {
            let enum_vals: Vec<Value> = genres.iter().map(|g| Value::String(g.clone())).collect();
            props.insert("genre".into(), json!({ "type": "string", "enum": enum_vals }));
        } else {
            props.insert("genre".into(), json!({ "type": "string" }));
        }
    }
    if fields.iter().any(|f| f == "energy") {
        props.insert(
            "energy".into(),
            json!({ "type": "integer", "minimum": 1, "maximum": 5 }),
        );
    }

    json!({
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": { "type": "object", "properties": props, "required": ["id"] }
            }
        },
        "required": ["suggestions"]
    })
}

fn user_content(request: &AiRequest) -> Result<String, String> {
    let payload =
        serde_json::to_string(&request.tracks).map_err(|e| format!("serialize tracks: {e}"))?;
    Ok(format!(
        "Faixas do lote (JSON). Sugira apenas os campos: {fields}.\n\n{payload}",
        fields = request.fields.join(", ")
    ))
}

/// Parse a `{ "suggestions": [...] }` value into our response shape.
fn parse_suggestions(obj: &Value) -> Result<AiResponse, String> {
    let suggestions: Vec<AiSuggestion> =
        serde_json::from_value(obj.get("suggestions").cloned().unwrap_or(Value::Null))
            .map_err(|e| format!("parse das sugestões: {e}"))?;
    Ok(AiResponse { suggestions })
}

/// Call the Claude Messages API (tool-use) for one batch.
async fn call_claude(
    api_key: &str,
    model: &str,
    system: String,
    user: String,
    schema: Value,
) -> Result<AiResponse, String> {
    let body = json!({
        "model": model,
        "max_tokens": 4096,
        "system": system,
        "tools": [{
            "name": "submit_tags",
            "description": "Devolve as tags sugeridas para cada faixa do lote.",
            "input_schema": schema,
        }],
        "tool_choice": { "type": "tool", "name": "submit_tags" },
        "messages": [{ "role": "user", "content": user }]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(CLAUDE_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", API_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("erro de rede: {e}"))?;

    let status = resp.status();
    let value: Value = resp.json().await.map_err(|e| format!("resposta inválida: {e}"))?;
    if !status.is_success() {
        let msg = value
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("erro desconhecido da API");
        return Err(format!("Claude API {status}: {msg}"));
    }

    let content = value.get("content").and_then(Value::as_array).cloned().unwrap_or_default();
    for block in content {
        if block.get("type").and_then(Value::as_str) == Some("tool_use") {
            if let Some(input) = block.get("input") {
                return parse_suggestions(input);
            }
        }
    }
    Err("A IA não retornou sugestões estruturadas.".into())
}

/// Candidate base URLs to try, in order. When the user configured `localhost`
/// we append a `127.0.0.1` fallback: `localhost` often resolves to IPv6 `::1`
/// first, but Ollama listens only on IPv4 by default, so the connection is
/// refused. Trying the literal IPv4 address sidesteps that.
fn ollama_candidates(base_url: &str) -> Vec<String> {
    let primary = base_url.trim().trim_end_matches('/').to_string();
    let mut out = vec![primary.clone()];
    if primary.contains("localhost") {
        out.push(primary.replace("localhost", "127.0.0.1"));
    }
    out
}

/// Call a local Ollama server (`/api/chat`) with a JSON-schema `format`.
async fn call_ollama(
    base_url: &str,
    model: &str,
    system: String,
    user: String,
    schema: Value,
) -> Result<AiResponse, String> {
    let body = json!({
        "model": model,
        "stream": false,
        "format": schema,
        "options": { "temperature": 0.2 },
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]
    });

    let client = reqwest::Client::new();
    // Try each candidate URL; a connection (send) error falls through to the
    // next one so the localhost → 127.0.0.1 fallback can kick in.
    let mut resp = None;
    let mut last_err = String::new();
    for url in ollama_candidates(base_url) {
        match client
            .post(format!("{url}/api/chat"))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
        {
            Ok(r) => {
                resp = Some(r);
                break;
            }
            Err(e) => last_err = format!("{e}"),
        }
    }
    let resp = resp.ok_or_else(|| {
        format!(
            "erro ao conectar no Ollama ({base_url}): {last_err}. O Ollama está rodando? (`ollama serve`)"
        )
    })?;

    let status = resp.status();
    let value: Value = resp.json().await.map_err(|e| format!("resposta inválida do Ollama: {e}"))?;
    if !status.is_success() {
        let msg = value.get("error").and_then(Value::as_str).unwrap_or("erro desconhecido");
        return Err(format!("Ollama {status}: {msg}"));
    }

    let content = value
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .ok_or("Ollama não retornou conteúdo.")?;
    let parsed: Value = serde_json::from_str(content)
        .map_err(|e| format!("Ollama retornou JSON inválido: {e}"))?;
    parse_suggestions(&parsed)
}

/// Tag one batch using the configured provider (Claude or Ollama).
#[tauri::command]
pub async fn tag_with_ai(app: AppHandle, request: AiRequest) -> Result<AiResponse, String> {
    if request.tracks.is_empty() {
        return Ok(AiResponse { suggestions: vec![] });
    }
    let cfg = config::load(&app);
    let system = system_prompt(request.char_limit, &request.fields, &cfg.genres, cfg.genre_strict);
    let user = user_content(&request)?;
    let schema = suggestions_schema(&request.fields, &cfg.genres, cfg.genre_strict);

    if cfg.provider == "ollama" {
        call_ollama(&cfg.ollama_url, &cfg.ollama_model, system, user, schema).await
    } else {
        if cfg.api_key.trim().is_empty() {
            return Err("API key não configurada. Abra Configurações e informe a chave.".into());
        }
        call_claude(&cfg.api_key, &cfg.model, system, user, schema).await
    }
}

/// Probe the configured Ollama server (`GET /api/tags`) and report whether it is
/// reachable and which models are installed. Used by the Settings "Test
/// connection" button to give actionable diagnostics instead of a bare error.
#[tauri::command]
pub async fn check_ollama(app: AppHandle) -> OllamaStatus {
    let cfg = config::load(&app);
    let client = reqwest::Client::new();
    let mut last_err = String::new();

    for url in ollama_candidates(&cfg.ollama_url) {
        match client.get(format!("{url}/api/tags")).send().await {
            Ok(resp) => {
                let status = resp.status();
                match resp.json::<Value>().await {
                    Ok(value) => {
                        if !status.is_success() {
                            last_err = format!("Ollama respondeu {status}");
                            continue;
                        }
                        let models: Vec<String> = value
                            .get("models")
                            .and_then(Value::as_array)
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|m| {
                                        m.get("name").and_then(Value::as_str).map(String::from)
                                    })
                                    .collect()
                            })
                            .unwrap_or_default();
                        // Match exact ("llama3.1:latest") or by base name ("llama3.1").
                        let want = cfg.ollama_model.trim();
                        let model_present = models.iter().any(|m| {
                            m == want || m.split(':').next() == Some(want)
                        });
                        return OllamaStatus {
                            ok: true,
                            url,
                            models,
                            model_present,
                            error: None,
                        };
                    }
                    Err(e) => last_err = format!("resposta inválida do Ollama: {e}"),
                }
            }
            Err(e) => last_err = format!("{e}"),
        }
    }

    OllamaStatus {
        ok: false,
        url: cfg.ollama_url,
        models: Vec::new(),
        model_present: false,
        error: Some(format!(
            "Não foi possível conectar no Ollama: {last_err}. Verifique se ele está rodando (`ollama serve`)."
        )),
    }
}
