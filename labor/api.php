<?php
// ===== AR Creator-Labor · Server-Schnittstelle =====
// Speichert Szenen (szene.json + Modell + Töne) unter daten/<geheime-id>/.
// Das Passwort wird beim ersten Aufruf festgelegt und nur als Hash in daten/.konfig.php gespeichert.
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

const DATEN = __DIR__ . '/daten';
const KONFIG = DATEN . '/.konfig.php';
const MAX_MODELL = 40 * 1024 * 1024;   // 40 MB
const MAX_TON = 10 * 1024 * 1024;      // 10 MB
const MAX_JSON = 400 * 1024;           // 400 KB
const TOKEN_TAGE = 30;
const TON_ENDUNGEN = ['m4a', 'mp3', 'wav', 'aac'];

function antwort(array $d, int $code = 200): void {
    http_response_code($code);
    echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
$GLOBALS['aufraeumen'] = null; // neu angelegter Ordner, der bei einem Fehler wieder weg soll
function fehler(string $text, int $code = 400): void {
    if ($GLOBALS['aufraeumen']) ordner_loeschen($GLOBALS['aufraeumen']);
    antwort(['ok' => false, 'fehler' => $text], $code);
}

function sicherstellen(): void {
    if (!is_dir(DATEN) && !mkdir(DATEN, 0755, true)) fehler('Datenordner kann nicht angelegt werden.', 500);
    $h = DATEN . '/.htaccess';
    if (!file_exists($h)) {
        file_put_contents($h, implode("\n", [
            'Options -Indexes',
            '# Keine Skripte im Datenordner ausführen',
            '<FilesMatch "\.(php|phtml|phar|php\d|pl|py|cgi|sh|htaccess)$">',
            '  Require all denied',
            '</FilesMatch>',
            '<IfModule mod_headers.c>',
            '  Header set X-Robots-Tag "noindex, nofollow"',
            '  Header set X-Content-Type-Options "nosniff"',
            '</IfModule>',
            'AddType model/gltf-binary .glb',
            'AddType audio/mp4 .m4a',
            '',
        ]));
    }
    if (!file_exists(DATEN . '/index.html')) file_put_contents(DATEN . '/index.html', '');
}

function konfig(): ?array {
    if (!file_exists(KONFIG)) return null;
    $k = include KONFIG;
    return is_array($k) ? $k : null;
}

function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }

function token_erstellen(array $k): string {
    $ablauf = (string)(time() + TOKEN_TAGE * 86400);
    return $ablauf . '.' . b64u(hash_hmac('sha256', $ablauf, $k['geheim'], true));
}
function token_pruefen(): void {
    $k = konfig();
    if (!$k) fehler('Das Labor ist noch nicht eingerichtet.', 403);
    $t = (string)($_POST['token'] ?? '');
    $teile = explode('.', $t);
    if (count($teile) !== 2 || !ctype_digit($teile[0]) || (int)$teile[0] < time()) fehler('Bitte neu anmelden.', 401);
    $soll = b64u(hash_hmac('sha256', $teile[0], $k['geheim'], true));
    if (!hash_equals($soll, $teile[1])) fehler('Bitte neu anmelden.', 401);
}

function gueltige_id(string $id): bool { return (bool)preg_match('/^[a-z0-9]{24}$/', $id); }
function neue_id(): string {
    $z = 'abcdefghijkmnopqrstuvwxyz23456789';
    $id = '';
    for ($i = 0; $i < 24; $i++) $id .= $z[random_int(0, strlen($z) - 1)];
    return $id;
}
function ordner_loeschen(string $pfad): void {
    if (!is_dir($pfad)) return;
    foreach (scandir($pfad) as $f) {
        if ($f === '.' || $f === '..') continue;
        $p = $pfad . '/' . $f;
        is_dir($p) ? ordner_loeschen($p) : unlink($p);
    }
    rmdir($pfad);
}
function beginnt_mit(string $datei, array $muster): bool {
    $kopf = (string)file_get_contents($datei, false, null, 0, 16);
    foreach ($muster as $m) {
        [$pos, $bytes] = $m;
        if (substr($kopf, $pos, strlen($bytes)) === $bytes) return true;
    }
    return false;
}
function ton_ok(string $datei, string $endung): bool {
    switch ($endung) {
        case 'wav': return beginnt_mit($datei, [[0, 'RIFF']]);
        case 'm4a': return beginnt_mit($datei, [[4, 'ftyp']]);
        case 'mp3': return beginnt_mit($datei, [[0, 'ID3'], [0, "\xFF\xFB"], [0, "\xFF\xF3"], [0, "\xFF\xF2"]]);
        case 'aac': return beginnt_mit($datei, [[0, "\xFF\xF1"], [0, "\xFF\xF9"], [4, 'ftyp']]);
    }
    return false;
}

sicherstellen();
$aktion = (string)($_POST['aktion'] ?? $_GET['aktion'] ?? '');

switch ($aktion) {

case 'status':
    antwort(['ok' => true, 'eingerichtet' => konfig() !== null]);

case 'einrichten':
    if (konfig()) fehler('Das Labor ist bereits eingerichtet.', 403);
    $pw = (string)($_POST['passwort'] ?? '');
    if (mb_strlen($pw) < 8) fehler('Das Passwort braucht mindestens 8 Zeichen.');
    $k = ['hash' => password_hash($pw, PASSWORD_DEFAULT), 'geheim' => bin2hex(random_bytes(32))];
    $inhalt = "<?php\n// Automatisch erstellt. Nicht weitergeben.\nreturn " . var_export($k, true) . ";\n";
    if (file_put_contents(KONFIG, $inhalt, LOCK_EX) === false) fehler('Einstellungen konnten nicht gespeichert werden.', 500);
    antwort(['ok' => true, 'token' => token_erstellen($k)]);

case 'anmelden':
    $k = konfig();
    if (!$k) fehler('Das Labor ist noch nicht eingerichtet.', 403);
    if (!password_verify((string)($_POST['passwort'] ?? ''), $k['hash'])) { sleep(2); fehler('Das Passwort stimmt nicht.', 401); }
    antwort(['ok' => true, 'token' => token_erstellen($k)]);

case 'passwort_aendern':
    token_pruefen();
    $k = konfig();
    if (!password_verify((string)($_POST['alt'] ?? ''), $k['hash'])) { sleep(2); fehler('Das bisherige Passwort stimmt nicht.', 401); }
    $neu = (string)($_POST['neu'] ?? '');
    if (mb_strlen($neu) < 8) fehler('Das neue Passwort braucht mindestens 8 Zeichen.');
    $k = ['hash' => password_hash($neu, PASSWORD_DEFAULT), 'geheim' => bin2hex(random_bytes(32))]; // alle Anmeldungen werden ungültig
    file_put_contents(KONFIG, "<?php\nreturn " . var_export($k, true) . ";\n", LOCK_EX);
    antwort(['ok' => true, 'token' => token_erstellen($k)]);

case 'liste':
    token_pruefen();
    $liste = [];
    foreach (scandir(DATEN) as $id) {
        if (!gueltige_id($id)) continue;
        $j = DATEN . "/$id/szene.json";
        if (!is_file($j)) continue;
        $s = json_decode((string)file_get_contents($j), true);
        $liste[] = [
            'id' => $id,
            'titel' => (string)($s['titel'] ?? 'Ohne Titel'),
            'modell' => (string)($s['modell']['name'] ?? ''),
            'notizen' => is_array($s['notizen'] ?? null) ? count($s['notizen']) : 0,
            'geaendert' => filemtime($j),
        ];
    }
    usort($liste, fn($a, $b) => $b['geaendert'] <=> $a['geaendert']);
    antwort(['ok' => true, 'szenen' => $liste]);

case 'speichern':
    token_pruefen();
    $roh = (string)($_POST['szene'] ?? '');
    if ($roh === '' || strlen($roh) > MAX_JSON) fehler('Die Szene fehlt oder ist zu groß.');
    $s = json_decode($roh, true);
    if (!is_array($s)) fehler('Die Szene ist beschädigt.');
    $id = (string)($_POST['id'] ?? '');
    if ($id === '') { do { $id = neue_id(); } while (is_dir(DATEN . "/$id")); }
    elseif (!gueltige_id($id) || !is_dir(DATEN . "/$id")) fehler('Diese Szene gibt es nicht.', 404);
    $ordner = DATEN . "/$id";
    if (!is_dir($ordner)) {
        if (!mkdir($ordner, 0755)) fehler('Ordner konnte nicht angelegt werden.', 500);
        $GLOBALS['aufraeumen'] = $ordner;
    }

    // Hochgeladene Dateien prüfen und ablegen
    foreach ($_FILES as $feld => $f) {
        if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            if (($f['error'] ?? 0) === UPLOAD_ERR_INI_SIZE || ($f['error'] ?? 0) === UPLOAD_ERR_FORM_SIZE) fehler('Eine Datei ist zu groß für den Server.');
            continue;
        }
        if ($feld === 'modell') {
            if ($f['size'] > MAX_MODELL) fehler('Das Modell ist zu groß (höchstens 40 MB).');
            if (!beginnt_mit($f['tmp_name'], [[0, 'glTF']])) fehler('Das Modell ist keine gültige GLB-Datei.');
            move_uploaded_file($f['tmp_name'], "$ordner/modell.glb");
        } elseif (preg_match('/^ton_([a-z0-9]{1,20})_(m4a|mp3|wav|aac)$/', $feld, $m)) {
            if ($f['size'] > MAX_TON) fehler('Eine Tonaufnahme ist zu groß (höchstens 10 MB).');
            if (!ton_ok($f['tmp_name'], $m[2])) fehler('Eine Tonaufnahme hat ein unbekanntes Format.');
            move_uploaded_file($f['tmp_name'], "$ordner/ton_{$m[1]}.{$m[2]}");
        }
    }

    // Verweise in der Szene prüfen und nicht mehr gebrauchte Dateien entfernen
    $gebraucht = ['szene.json' => true];
    if (($s['modell']['quelle'] ?? '') === 'eigen') {
        if (!is_file("$ordner/modell.glb")) fehler('Das eigene Modell fehlt.');
        $gebraucht['modell.glb'] = true;
    }
    $tonPruefen = function ($ton) use ($ordner, &$gebraucht) {
        if (!is_array($ton) || ($ton['art'] ?? '') !== 'datei') return;
        $d = (string)($ton['datei'] ?? '');
        if (!preg_match('/^ton_[a-z0-9]{1,20}\.(m4a|mp3|wav|aac)$/', $d) || !is_file("$ordner/$d")) fehler('Eine Tonaufnahme fehlt.');
        $gebraucht[$d] = true;
    };
    $tonPruefen($s['info']['ton'] ?? null);
    foreach (($s['notizen'] ?? []) as $n) $tonPruefen($n['ton'] ?? null);
    foreach (scandir($ordner) as $f) {
        if ($f === '.' || $f === '..' || isset($gebraucht[$f])) continue;
        if (is_file("$ordner/$f")) unlink("$ordner/$f");
    }

    $s['geaendert'] = date('c');
    file_put_contents("$ordner/szene.json", json_encode($s, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    $GLOBALS['aufraeumen'] = null;
    antwort(['ok' => true, 'id' => $id]);

case 'loeschen':
    token_pruefen();
    $id = (string)($_POST['id'] ?? '');
    if (!gueltige_id($id)) fehler('Ungültige Szene.');
    ordner_loeschen(DATEN . "/$id");
    antwort(['ok' => true]);

default:
    fehler('Unbekannte Aktion.', 404);
}
