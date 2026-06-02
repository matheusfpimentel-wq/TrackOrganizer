use crate::config;
use crate::model::{AiRequest, AiResponse, AiSuggestion};
use serde_json::{json, Value};
use tauri::AppHandle;

const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";

/// Build the system prompt that encodes the curation rules.
fn system_prompt(char_limit: u32, fields: &[String]) -> String {
    let wants = |f: &str| fields.iter().any(|x| x == f);

    let mut rules = String::from(
        "Você é um curador especialista em metadados para DJs de Open Format, com foco \
forte em música latina e brasileira. Recebe um LOTE de faixas (JSON) e devolve sugestões \
de tags via a ferramenta `submit_tags`. Use SEMPRE como contexto: Título + Artista + \
tags existentes + nome do arquivo.\n\n\
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
        "\nSAÍDA:\n- Chame `submit_tags` com uma entrada por faixa, usando o MESMO `id` \
recebido. Inclua APENAS os campos solicitados; se não tiver certeza de um campo, omita-o. \
Não invente dados factuais (ano/álbum).\n",
    );
    rules
}

/// Tool schema constraining the model output to our suggestion shape.
fn tool_schema(fields: &[String]) -> Value {
    let mut props = serde_json::Map::new();
    props.insert("id".into(), json!({ "type": "string" }));
    if fields.iter().any(|f| f == "title") {
        props.insert("title".into(), json!({ "type": "string" }));
    }
    if fields.iter().any(|f| f == "artist") {
        props.insert("artist".into(), json!({ "type": "string" }));
    }
    if fields.iter().any(|f| f == "genre") {
        props.insert("genre".into(), json!({ "type": "string" }));
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
                "items": {
                    "type": "object",
                    "properties": props,
                    "required": ["id"]
                }
            }
        },
        "required": ["suggestions"]
    })
}

/// Call the Claude Messages API for one batch and return parsed suggestions.
#[tauri::command]
pub async fn tag_with_ai(app: AppHandle, request: AiRequest) -> Result<AiResponse, String> {
    let cfg = config::load(&app);
    if cfg.api_key.trim().is_empty() {
        return Err("API key não configurada. Abra Configurações e informe a chave.".into());
    }
    if request.tracks.is_empty() {
        return Ok(AiResponse { suggestions: vec![] });
    }

    let system = system_prompt(request.char_limit, &request.fields);
    let user_payload =
        serde_json::to_string(&request.tracks).map_err(|e| format!("serialize tracks: {e}"))?;

    let body = json!({
        "model": cfg.model,
        "max_tokens": 4096,
        "system": system,
        "tools": [{
            "name": "submit_tags",
            "description": "Devolve as tags sugeridas para cada faixa do lote.",
            "input_schema": tool_schema(&request.fields),
        }],
        "tool_choice": { "type": "tool", "name": "submit_tags" },
        "messages": [{
            "role": "user",
            "content": format!(
                "Faixas do lote (JSON). Sugira apenas os campos: {fields}.\n\n{payload}",
                fields = request.fields.join(", "),
                payload = user_payload
            )
        }]
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(API_URL)
        .header("x-api-key", cfg.api_key)
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
        return Err(format!("API {status}: {msg}"));
    }

    // Find the tool_use block and parse its input into our response shape.
    let content = value.get("content").and_then(Value::as_array).cloned().unwrap_or_default();
    for block in content {
        if block.get("type").and_then(Value::as_str) == Some("tool_use") {
            if let Some(input) = block.get("input") {
                let suggestions: Vec<AiSuggestion> = serde_json::from_value(
                    input.get("suggestions").cloned().unwrap_or(Value::Null),
                )
                .map_err(|e| format!("parse das sugestões: {e}"))?;
                return Ok(AiResponse { suggestions });
            }
        }
    }

    Err("A IA não retornou sugestões estruturadas.".into())
}
