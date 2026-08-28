//! Persistent loopback core for Pointer (DR-0006).
//!
//! Bind 127.0.0.1 only. Electron talks JSON over HTTP. Windows click/move/wheel
//! use user32 directly so the hot path does not spawn PowerShell. Other ops
//! refuse with windows-only / unknown so the JS driver can fall back.

use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

fn pointer_home() -> PathBuf {
    if let Ok(h) = env::var("POINTER_HOME") {
        let trimmed = h.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    let base = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into());
    PathBuf::from(base).join(".pointer")
}

fn port() -> u16 {
    env::var("POINTER_CORE_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .filter(|p| *p > 0)
        .unwrap_or(18011)
}

fn health_json() -> String {
    let home = pointer_home();
    format!(
        "{{\"ok\":true,\"engine\":\"rust\",\"persistent\":true,\"home\":\"{}\",\"bind\":\"127.0.0.1:{}\",\"ops\":[\"click\",\"move\",\"wheel\",\"pos\",\"type\",\"tap\",\"combo\",\"keys\"]}}",
        escape_json(&home.to_string_lossy()),
        port()
    )
}

fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn write_pid(home: &PathBuf) {
    let _ = fs::create_dir_all(home);
    let _ = fs::write(home.join("core.pid"), format!("{}\n", std::process::id()));
    let _ = fs::write(home.join("core.json"), health_json());
}

#[cfg(windows)]
mod win {
    #[link(name = "user32")]
    extern "system" {
        fn SetCursorPos(x: i32, y: i32) -> i32;
        fn mouse_event(dw_flags: u32, dx: u32, dy: u32, dw_data: u32, extra: usize);
        fn GetCursorPos(pt: *mut Point) -> i32;
        fn SendInput(n: u32, p: *const KeyInput, cb: i32) -> u32;
        fn GetAsyncKeyState(vk: i32) -> i16;
        fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, extra: usize);
    }

    #[repr(C)]
    pub struct Point {
        pub x: i32,
        pub y: i32,
    }

    #[repr(C)]
    pub struct KeyInput {
        type_: u32,
        _pad: u32,
        w_vk: u16,
        w_scan: u16,
        dw_flags: u32,
        time: u32,
        extra: usize,
        _tail: u64,
    }

    const MOUSEEVENTF_LEFTDOWN: u32 = 0x0002;
    const MOUSEEVENTF_LEFTUP: u32 = 0x0004;
    const MOUSEEVENTF_RIGHTDOWN: u32 = 0x0008;
    const MOUSEEVENTF_RIGHTUP: u32 = 0x0010;
    const MOUSEEVENTF_WHEEL: u32 = 0x0800;
    const INPUT_KEYBOARD: u32 = 1;
    const KEYEVENTF_KEYUP: u32 = 0x0002;
    const KEYEVENTF_UNICODE: u32 = 0x0004;

    pub fn click(x: i32, y: i32, right: bool) -> Result<(), String> {
        unsafe {
            if SetCursorPos(x, y) == 0 {
                return Err("SetCursorPos failed".into());
            }
            let down = if right {
                MOUSEEVENTF_RIGHTDOWN
            } else {
                MOUSEEVENTF_LEFTDOWN
            };
            let up = if right {
                MOUSEEVENTF_RIGHTUP
            } else {
                MOUSEEVENTF_LEFTUP
            };
            mouse_event(down, 0, 0, 0, 0);
            mouse_event(up, 0, 0, 0, 0);
        }
        Ok(())
    }

    pub fn move_to(x: i32, y: i32) -> Result<(), String> {
        unsafe {
            if SetCursorPos(x, y) == 0 {
                return Err("SetCursorPos failed".into());
            }
        }
        Ok(())
    }

    pub fn wheel(delta: i32) -> Result<(), String> {
        unsafe {
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, delta as u32, 0);
        }
        Ok(())
    }

    pub fn pos() -> Result<(i32, i32), String> {
        let mut pt = Point { x: 0, y: 0 };
        unsafe {
            if GetCursorPos(&mut pt) == 0 {
                return Err("GetCursorPos failed".into());
            }
        }
        Ok((pt.x, pt.y))
    }

    fn send_key(w_vk: u16, w_scan: u16, flags: u32) -> Result<(), String> {
        let input = KeyInput {
            type_: INPUT_KEYBOARD,
            _pad: 0,
            w_vk,
            w_scan,
            dw_flags: flags,
            time: 0,
            extra: 0,
            _tail: 0,
        };
        let n = unsafe { SendInput(1, &input, std::mem::size_of::<KeyInput>() as i32) };
        if n != 1 {
            return Err("SendInput failed".into());
        }
        Ok(())
    }

    pub fn tap(vk: u8) -> Result<(), String> {
        unsafe {
            keybd_event(vk, 0, 0, 0);
            keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
        }
        Ok(())
    }

    pub fn combo(mods: &[u8], vk: u8) -> Result<(), String> {
        unsafe {
            for m in mods {
                keybd_event(*m, 0, 0, 0);
            }
            keybd_event(vk, 0, 0, 0);
            keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
            for m in mods.iter().rev() {
                keybd_event(*m, 0, KEYEVENTF_KEYUP, 0);
            }
        }
        Ok(())
    }

    pub fn type_text(text: &str) -> Result<(), String> {
        for unit in text.encode_utf16().take(4000) {
            send_key(0, unit, KEYEVENTF_UNICODE)?;
            send_key(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)?;
        }
        Ok(())
    }

    pub fn keys_down(vks: &[i32]) -> bool {
        if vks.is_empty() {
            return false;
        }
        vks.iter().all(|vk| unsafe { GetAsyncKeyState(*vk) as u16 & 0x8000 != 0 })
    }
}

fn json_i32(body: &str, key: &str) -> Option<i32> {
    let pat = format!("\"{}\"", key);
    let idx = body.find(&pat)?;
    let rest = &body[idx + pat.len()..];
    let rest = rest.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
    let num: String = rest
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '-')
        .collect();
    num.parse().ok()
}

fn json_bool(body: &str, key: &str) -> bool {
    let pat = format!("\"{}\"", key);
    if let Some(idx) = body.find(&pat) {
        let rest = &body[idx + pat.len()..];
        let rest = rest.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
        return rest.starts_with("true");
    }
    false
}

fn json_op(body: &str) -> String {
    let pat = "\"op\"";
    if let Some(idx) = body.find(pat) {
        let rest = &body[idx + pat.len()..];
        let rest = rest.trim_start_matches(|c: char| c == ':' || c.is_whitespace() || c == '"');
        return rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_').collect();
    }
    String::new()
}

fn json_str(body: &str, key: &str) -> Option<String> {
    let pat = format!("\"{}\"", key);
    let idx = body.find(&pat)?;
    let rest = &body[idx + pat.len()..];
    let rest = rest.trim_start_matches(|c: char| c == ':' || c.is_whitespace());
    if !rest.starts_with('"') {
        return None;
    }
    let mut out = String::new();
    let mut chars = rest[1..].chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(n) = chars.next() {
                out.push(n);
            }
        } else if c == '"' {
            break;
        } else {
            out.push(c);
        }
    }
    Some(out)
}

fn json_i32_list(body: &str, key: &str) -> Vec<i32> {
    let pat = format!("\"{}\"", key);
    let Some(idx) = body.find(&pat) else {
        return Vec::new();
    };
    let rest = &body[idx + pat.len()..];
    let Some(start) = rest.find('[') else {
        return Vec::new();
    };
    let rest = &rest[start + 1..];
    let end = rest.find(']').unwrap_or(0);
    rest[..end]
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .take(8)
        .collect()
}

fn decode_b64(input: &str) -> Option<String> {
    fn val(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'a'..=b'z' => Some(c - b'a' + 26),
            b'0'..=b'9' => Some(c - b'0' + 52),
            b'+' => Some(62),
            b'/' => Some(63),
            b'=' => Some(0),
            _ => None,
        }
    }
    let bytes: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if bytes.len() % 4 != 0 {
        return None;
    }
    let mut out = Vec::new();
    for chunk in bytes.chunks(4) {
        let a = val(chunk[0])?;
        let b = val(chunk[1])?;
        let c = val(chunk[2])?;
        let d = val(chunk[3])?;
        out.push((a << 2) | (b >> 4));
        if chunk[2] != b'=' {
            out.push((b << 4) | (c >> 2));
        }
        if chunk[3] != b'=' {
            out.push((c << 6) | d);
        }
    }
    String::from_utf8(out).ok()
}

fn type_payload(body: &str) -> String {
    if let Some(b64) = json_str(body, "b64") {
        return decode_b64(&b64).unwrap_or_default();
    }
    json_str(body, "text").unwrap_or_default()
}

fn handle_op(body: &str) -> String {
    let op = json_op(body);
    match op.as_str() {
        "ping" | "health" => health_json(),
        "click" => {
            let x = json_i32(body, "x").unwrap_or(0);
            let y = json_i32(body, "y").unwrap_or(0);
            let right = json_bool(body, "right");
            #[cfg(windows)]
            {
                match win::click(x, y, right) {
                    Ok(()) => format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"click\",\"x\":{x},\"y\":{y}}}"),
                    Err(e) => format!("{{\"ok\":false,\"reason\":\"{}\"}}", escape_json(&e)),
                }
            }
            #[cfg(not(windows))]
            {
                let _ = (x, y, right);
                "{\"ok\":false,\"reason\":\"windows-only\"}".into()
            }
        }
        "move" => {
            let x = json_i32(body, "x").unwrap_or(0);
            let y = json_i32(body, "y").unwrap_or(0);
            #[cfg(windows)]
            {
                match win::move_to(x, y) {
                    Ok(()) => format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"move\",\"x\":{x},\"y\":{y}}}"),
                    Err(e) => format!("{{\"ok\":false,\"reason\":\"{}\"}}", escape_json(&e)),
                }
            }
            #[cfg(not(windows))]
            {
                let _ = (x, y);
                "{\"ok\":false,\"reason\":\"windows-only\"}".into()
            }
        }
        "wheel" => {
            let delta = json_i32(body, "delta").unwrap_or(-120);
            #[cfg(windows)]
            {
                match win::wheel(delta) {
                    Ok(()) => format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"wheel\",\"delta\":{delta}}}"),
                    Err(e) => format!("{{\"ok\":false,\"reason\":\"{}\"}}", escape_json(&e)),
                }
            }
            #[cfg(not(windows))]
            {
                let _ = delta;
                "{\"ok\":false,\"reason\":\"windows-only\"}".into()
            }
        }
        "pos" => {
            #[cfg(windows)]
            {
                match win::pos() {
                    Ok((x, y)) => format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"pos\",\"x\":{x},\"y\":{y}}}"),
                    Err(e) => format!("{{\"ok\":false,\"reason\":\"{}\"}}", escape_json(&e)),
                }
            }
            #[cfg(not(windows))]
            "{\"ok\":false,\"reason\":\"windows-only\"}".into()
        }
        "type" => {
            let text = type_payload(body);
            #[cfg(windows)]
            {
                let len = text.chars().count();
                match win::type_text(&text) {
                    Ok(()) => format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"type\",\"len\":{len}}}"),
                    Err(e) => format!("{{\"ok\":false,\"reason\":\"{}\"}}", escape_json(&e)),
                }
            }
            #[cfg(not(windows))]
            {
                let _ = text;
                "{\"ok\":false,\"reason\":\"windows-only\"}".into()
            }
        }
        "tap" => {
            let vk = json_i32(body, "vk").unwrap_or(0).clamp(0, 255) as u8;
            #[cfg(windows)]
            {
                match win::tap(vk) {
                    Ok(()) => format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"tap\",\"vk\":{vk}}}"),
                    Err(e) => format!("{{\"ok\":false,\"reason\":\"{}\"}}", escape_json(&e)),
                }
            }
            #[cfg(not(windows))]
            {
                let _ = vk;
                "{\"ok\":false,\"reason\":\"windows-only\"}".into()
            }
        }
        "combo" => {
            let vk = json_i32(body, "vk").unwrap_or(0).clamp(0, 255) as u8;
            let mods: Vec<u8> = json_i32_list(body, "mods")
                .into_iter()
                .filter(|n| *n >= 0 && *n <= 255)
                .map(|n| n as u8)
                .collect();
            #[cfg(windows)]
            {
                match win::combo(&mods, vk) {
                    Ok(()) => format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"combo\",\"vk\":{vk}}}"),
                    Err(e) => format!("{{\"ok\":false,\"reason\":\"{}\"}}", escape_json(&e)),
                }
            }
            #[cfg(not(windows))]
            {
                let _ = (vk, mods);
                "{\"ok\":false,\"reason\":\"windows-only\"}".into()
            }
        }
        "keys" => {
            let vks = json_i32_list(body, "vks");
            #[cfg(windows)]
            {
                let down = win::keys_down(&vks);
                format!("{{\"ok\":true,\"engine\":\"rust\",\"op\":\"keys\",\"down\":{down}}}")
            }
            #[cfg(not(windows))]
            {
                let _ = vks;
                "{\"ok\":false,\"reason\":\"windows-only\"}".into()
            }
        }
        _ => format!(
            "{{\"ok\":false,\"reason\":\"unknown-op\",\"op\":\"{}\"}}",
            escape_json(&op)
        ),
    }
}

fn read_http(stream: &mut TcpStream) -> Option<(String, String)> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    loop {
        let n = stream.read(&mut tmp).ok()?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if buf.len() > 64 * 1024 {
            break;
        }
    }
    let text = String::from_utf8_lossy(&buf);
    let (head, rest) = text.split_once("\r\n\r\n")?;
    let first = head.lines().next().unwrap_or("");
    let mut content_len = 0usize;
    for line in head.lines() {
        let lower = line.to_ascii_lowercase();
        if let Some(v) = lower.strip_prefix("content-length:") {
            content_len = v.trim().parse().unwrap_or(0);
        }
    }
    let mut body = rest.as_bytes().to_vec();
    while body.len() < content_len {
        let n = stream.read(&mut tmp).ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
    }
    if body.len() > content_len {
        body.truncate(content_len);
    }
    Some((first.to_string(), String::from_utf8_lossy(&body).into_owned()))
}

fn write_json(stream: &mut TcpStream, status: &str, body: &str) {
    let bytes = body.as_bytes();
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        bytes.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(bytes);
    let _ = stream.flush();
}

fn serve(mut stream: TcpStream) {
    let Some((first, body)) = read_http(&mut stream) else {
        return;
    };
    if first.starts_with("GET /health") || first.starts_with("GET / ") {
        write_json(&mut stream, "200 OK", &health_json());
        return;
    }
    if first.starts_with("POST /v1/op") {
        write_json(&mut stream, "200 OK", &handle_op(&body));
        return;
    }
    write_json(&mut stream, "404 Not Found", "{\"ok\":false,\"reason\":\"not-found\"}");
}

fn main() {
    let home = pointer_home();
    write_pid(&home);
    let bind = format!("127.0.0.1:{}", port());
    let listener = TcpListener::bind(&bind).unwrap_or_else(|e| {
        eprintln!("pointer-core bind {bind}: {e}");
        std::process::exit(1);
    });
    eprintln!("pointer-core on http://{bind} home={}", home.display());
    for incoming in listener.incoming() {
        if let Ok(stream) = incoming {
            std::thread::spawn(move || serve(stream));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_json_names_rust_and_home() {
        let raw = health_json();
        assert!(raw.contains("\"engine\":\"rust\""));
        assert!(raw.contains("\"persistent\":true"));
        assert!(raw.contains("\"ok\":true"));
    }

    #[test]
    fn json_op_reads_click() {
        assert_eq!(json_op("{\"op\":\"click\",\"x\":10,\"y\":20}"), "click");
        assert_eq!(json_i32("{\"x\":40}", "x"), Some(40));
        assert_eq!(json_bool("{\"right\":true}", "right"), true);
    }

    #[test]
    fn unknown_op_refuses() {
        let raw = handle_op("{\"op\":\"shell\"}");
        assert!(raw.contains("unknown-op"));
        assert!(raw.contains("\"ok\":false"));
    }

    #[test]
    fn decode_b64_hello() {
        assert_eq!(decode_b64("aGVsbG8=").as_deref(), Some("hello"));
        assert_eq!(type_payload("{\"op\":\"type\",\"b64\":\"aGk=\"}"), "hi");
        assert_eq!(json_i32_list("{\"vks\":[17,18,32]}", "vks"), vec![17, 18, 32]);
    }

    #[test]
    fn non_windows_type_is_windows_only() {
        if cfg!(windows) {
            return;
        }
        let raw = handle_op("{\"op\":\"type\",\"text\":\"hi\"}");
        assert!(raw.contains("windows-only"));
    }
}
