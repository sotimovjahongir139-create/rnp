<?php
/**
 * production_push.php
 *
 * cPanel-side reader/pusher for RNP Analytics production data.
 *
 * WHY: the odin analytics VPS cannot make outbound MySQL :3306 connections
 * (Contabo blocks it). The factory production data lives in the
 * `arconper_arcon` MySQL on the cPanel host, so we read it HERE and PUSH it to
 * odin's backend over HTTPS via POST /api/ingest/production.
 *
 * Usage:
 *   php production_push.php [days_back]
 *
 *   days_back (int, default 2) - how many days, counting back from yesterday,
 *   to read and push. For each i in 1..days_back the day is (today - i), using
 *   the cPanel box local date.
 *
 * Config: production_push.config.php (sibling file) returns an assoc array.
 *
 * PHP 7/8 compatible. No PHP 8-only syntax.
 */

// ---------------------------------------------------------------------------
// Load config
// ---------------------------------------------------------------------------
// Config comes from a sibling config file if present, otherwise from environment
// variables (lets the cPanel cron run a downloaded copy with secrets passed inline).
$configPath = __DIR__ . '/production_push.config.php';
if (is_file($configPath)) {
    $config = require $configPath;
    if (!is_array($config)) {
        fwrite(STDERR, "ERROR: config file did not return an array: {$configPath}\n");
        exit(1);
    }
} else {
    $config = array(
        'db_host'            => getenv('FACTORY_DB_HOST') ?: 'localhost',
        'db_port'            => getenv('FACTORY_DB_PORT') ?: 3306,
        'db_name'            => getenv('FACTORY_DB_NAME') ?: 'arconper_arcon',
        'db_user'            => getenv('FACTORY_DB_USER') ?: 'arconper_ro',
        'db_pass'            => getenv('FACTORY_DB_PASS') ?: '',
        'ingest_url'         => getenv('INGEST_URL') ?: '',
        'ingest_secret'      => getenv('INGEST_SECRET') ?: '',
        'ingest_host_header' => getenv('INGEST_HOST_HEADER') ?: null,
        'verify_tls'         => getenv('VERIFY_TLS') === false ? true : (getenv('VERIFY_TLS') !== '0'),
    );
}

$dbHost          = isset($config['db_host']) ? (string) $config['db_host'] : 'localhost';
$dbPort          = isset($config['db_port']) ? (int) $config['db_port'] : 3306;
$dbName          = isset($config['db_name']) ? (string) $config['db_name'] : '';
$dbUser          = isset($config['db_user']) ? (string) $config['db_user'] : '';
$dbPass          = isset($config['db_pass']) ? (string) $config['db_pass'] : '';
$ingestUrl       = isset($config['ingest_url']) ? (string) $config['ingest_url'] : '';
$ingestSecret    = isset($config['ingest_secret']) ? (string) $config['ingest_secret'] : '';
$ingestHostHdr   = isset($config['ingest_host_header']) ? $config['ingest_host_header'] : null;
$verifyTls       = isset($config['verify_tls']) ? (bool) $config['verify_tls'] : true;

if ($ingestUrl === '') {
    fwrite(STDERR, "ERROR: ingest_url is empty in config.\n");
    exit(1);
}
if ($ingestSecret === '') {
    fwrite(STDERR, "ERROR: ingest_secret is empty in config.\n");
    exit(1);
}

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
$daysBack = 2;
if (isset($argv[1])) {
    $daysBack = (int) $argv[1];
}
if ($daysBack < 1) {
    $daysBack = 1;
}

// ---------------------------------------------------------------------------
// Workshop name normalization (source name -> dashboard label)
// ---------------------------------------------------------------------------
function normalize_workshop($name) {
    $map = array(
        'Sifat Nazorati' => 'Sifat nazorati',
        'Sklad (Kirim)'  => 'Sklad',
    );
    if (isset($map[$name])) {
        return $map[$name];
    }
    return $name;
}

// ---------------------------------------------------------------------------
// Connect to MySQL
// ---------------------------------------------------------------------------
mysqli_report(MYSQLI_REPORT_OFF); // we handle errors manually
$mysqli = @mysqli_connect($dbHost, $dbUser, $dbPass, $dbName, $dbPort);
if (!$mysqli) {
    fwrite(STDERR, "ERROR: MySQL connect failed: " . mysqli_connect_error() . "\n");
    exit(1);
}
$mysqli->set_charset('utf8mb4');

// ---------------------------------------------------------------------------
// Prepared statements (reused per-day)
// ---------------------------------------------------------------------------
$workshopSql = "SELECT j.name AS stage,
       COUNT(*) AS cards_in,
       SUM(p.finished IS NOT NULL) AS cards_done,
       COALESCE(SUM(p.quantity),0) AS qty_in,
       COALESCE(SUM(CASE WHEN p.finished IS NOT NULL THEN p.quantity ELSE 0 END),0) AS qty_done,
       AVG(CASE WHEN p.finished IS NOT NULL THEN DATEDIFF(p.finished,p.started) END) AS avg_cycle
FROM production_proizvodstvo p
JOIN production_jarayon j ON p.jarayon_id = j.id
WHERE DATE(p.started) = ?
GROUP BY j.name";

$skladZakazSql  = "SELECT COUNT(*) AS c FROM production_skladzakaz WHERE DATE(created) = ?";
$skladKirimSql  = "SELECT COUNT(*) AS c, SUM(finished IS NOT NULL) AS d FROM production_proizvodstvo WHERE jarayon_id=5 AND DATE(started) = ?";
$skladChiqimSql = "SELECT COUNT(*) AS c, SUM(approved=1) AS a FROM production_sotuv WHERE DATE(sold_date) = ?";

$stmtWorkshop    = $mysqli->prepare($workshopSql);
$stmtSkladZakaz  = $mysqli->prepare($skladZakazSql);
$stmtSkladKirim  = $mysqli->prepare($skladKirimSql);
$stmtSkladChiqim = $mysqli->prepare($skladChiqimSql);

if (!$stmtWorkshop || !$stmtSkladZakaz || !$stmtSkladKirim || !$stmtSkladChiqim) {
    fwrite(STDERR, "ERROR: failed to prepare a statement: " . $mysqli->error . "\n");
    $mysqli->close();
    exit(1);
}

// ---------------------------------------------------------------------------
// Build the days array
// ---------------------------------------------------------------------------
$days = array();

for ($i = 1; $i <= $daysBack; $i++) {
    // cPanel box local date; yesterday going backwards.
    $d = date('Y-m-d', strtotime("-{$i} day"));

    // --- Workshops ---------------------------------------------------------
    $workshops = array();
    $stmtWorkshop->bind_param('s', $d);
    if (!$stmtWorkshop->execute()) {
        fwrite(STDERR, "ERROR: workshop query failed for {$d}: " . $stmtWorkshop->error . "\n");
        exit(1);
    }
    $res = $stmtWorkshop->get_result();
    while ($row = $res->fetch_assoc()) {
        $cardsIn   = (int) $row['cards_in'];
        $cardsDone = (int) $row['cards_done'];
        $avgCycle  = ($row['avg_cycle'] === null) ? null : round((float) $row['avg_cycle'], 2);
        $efficiency = $cardsIn > 0 ? round($cardsDone / $cardsIn * 100, 1) : 0;

        $workshops[] = array(
            'workshop'       => normalize_workshop($row['stage']),
            'cards_in'       => $cardsIn,
            'cards_done'     => $cardsDone,
            'qty_in'         => (int) $row['qty_in'],
            'qty_done'       => (int) $row['qty_done'],
            'efficiency_pct' => $efficiency,
            'avg_cycle_days' => $avgCycle,
        );
    }
    $res->free();

    // --- sklad_zakaz -------------------------------------------------------
    $stmtSkladZakaz->bind_param('s', $d);
    if (!$stmtSkladZakaz->execute()) {
        fwrite(STDERR, "ERROR: sklad_zakaz query failed for {$d}: " . $stmtSkladZakaz->error . "\n");
        exit(1);
    }
    $row = $stmtSkladZakaz->get_result()->fetch_assoc();
    $skladZakaz = (int) $row['c'];

    // --- sklad_kirim -------------------------------------------------------
    $stmtSkladKirim->bind_param('s', $d);
    if (!$stmtSkladKirim->execute()) {
        fwrite(STDERR, "ERROR: sklad_kirim query failed for {$d}: " . $stmtSkladKirim->error . "\n");
        exit(1);
    }
    $row = $stmtSkladKirim->get_result()->fetch_assoc();
    $skladKirim     = (int) $row['c'];
    $skladKirimDone = (int) $row['d'];

    // --- sklad_chiqim ------------------------------------------------------
    $stmtSkladChiqim->bind_param('s', $d);
    if (!$stmtSkladChiqim->execute()) {
        fwrite(STDERR, "ERROR: sklad_chiqim query failed for {$d}: " . $stmtSkladChiqim->error . "\n");
        exit(1);
    }
    $row = $stmtSkladChiqim->get_result()->fetch_assoc();
    $skladChiqim         = (int) $row['c'];
    $skladChiqimApproved = (int) $row['a'];

    // --- chain -------------------------------------------------------------
    $chain = array(
        'stat_period'           => $d . '..' . $d,
        'sklad_zakaz'           => $skladZakaz,
        'sklad_kirim'           => $skladKirim,
        'sklad_kirim_done'      => $skladKirimDone,
        'sklad_chiqim'          => $skladChiqim,
        'sklad_chiqim_approved' => $skladChiqimApproved,
    );

    $days[] = array(
        'stat_date'  => $d,
        'workshops'  => $workshops,
        'chain'      => $chain,
    );
}

// Close statements + connection now that all reads are done.
$stmtWorkshop->close();
$stmtSkladZakaz->close();
$stmtSkladKirim->close();
$stmtSkladChiqim->close();
$mysqli->close();

// ---------------------------------------------------------------------------
// Build payload + POST to ingest endpoint
// ---------------------------------------------------------------------------
$payload = array('days' => $days);
$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    fwrite(STDERR, "ERROR: failed to JSON-encode payload: " . json_last_error_msg() . "\n");
    exit(1);
}

$headers = array(
    'Content-Type: application/json',
    'X-Ingest-Secret: ' . $ingestSecret,
);
if ($ingestHostHdr !== null && $ingestHostHdr !== '') {
    // Supports posting to a bare IP before DNS/TLS is set up; nginx routes by Host.
    $headers[] = 'Host: ' . $ingestHostHdr;
}

$ch = curl_init($ingestUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, $verifyTls);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, $verifyTls ? 2 : 0);

$responseBody = curl_exec($ch);
if ($responseBody === false) {
    fwrite(STDERR, "ERROR: curl request failed: " . curl_error($ch) . "\n");
    curl_close($ch);
    exit(1);
}
$httpStatus = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP {$httpStatus}\n";
echo $responseBody . "\n";

if ($httpStatus >= 200 && $httpStatus < 300) {
    exit(0);
}
exit(1);
