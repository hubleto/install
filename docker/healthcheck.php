<?php declare(strict_types=1);

try {
    if (!is_file('/var/lib/hubleto/initialized')) {
        throw new RuntimeException('Installation is incomplete.');
    }
    require '/var/lib/hubleto/ConfigEnv.php';
    $db = new PDO(
        'mysql:host=' . $config['db_host'] . ';dbname=' . $config['db_name'],
        $config['db_user'],
        $config['db_password'],
        [PDO::ATTR_TIMEOUT => 3, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
    );
    $db->query('SELECT 1');
    // Also verify that FPM is listening when this script is run by Docker's CLI probe.
    if (PHP_SAPI === 'cli') {
        $socket = @fsockopen('127.0.0.1', 9000, $errno, $error, 2);
        if (!$socket) {
            throw new RuntimeException('PHP-FPM is unavailable.');
        }
        fclose($socket);
    }
    echo "ok\n";
} catch (Throwable $e) {
    http_response_code(503);
    fwrite(fopen('php://stderr', 'w'), "Hubleto is not ready: {$e->getMessage()}\n");
    exit(1);
}
