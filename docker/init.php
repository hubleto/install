<?php declare(strict_types=1);

// Do not use the CLI wrapper here: it catches installer exceptions and exits with 0.
$finished = false;
register_shutdown_function(static function () use (&$finished): void {
    if (!$finished) {
        fwrite(STDERR, "Hubleto initialization did not complete. See the init service logs.\n");
        exit(1);
    }
});

try {
    umask(0077);
    $state = '/var/lib/hubleto';
    $project = dirname(__DIR__);
    chdir($project);
    $lock = fopen($state . '/init.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        throw new RuntimeException('Another initializer is running.');
    }

    if (is_file($state . '/initialized') && is_file($state . '/ConfigEnv.php')) {
        echo "Hubleto is already initialized; keeping the existing database and configuration.\n";
        $finished = true;
        exit(0);
    }
    if (is_file($state . '/initializing') || is_file($state . '/initialized') || is_file($state . '/ConfigEnv.php')) {
        throw new RuntimeException(
            'An incomplete installation exists. Initialization will not run again automatically. '
            . 'See docker/README.md for recovery instructions.'
        );
    }

    $env = static fn (string $name, string $default = ''): string => getenv($name) !== false
        ? (string) getenv($name) : $default;
    $url = rtrim($env('HUBLETO_URL', 'http://localhost:8080'), '/');
    $urlParts = parse_url($url);
    if (!filter_var($url, FILTER_VALIDATE_URL)
        || !in_array($urlParts['scheme'] ?? '', ['http', 'https'], true)
        || !empty($urlParts['query']) || !empty($urlParts['fragment'])
        || !empty($urlParts['user']) || !empty($urlParts['pass'])
        || !in_array($urlParts['path'] ?? '', ['', '/'], true)) {
        throw new RuntimeException('HUBLETO_URL must be an http(s) URL without a subpath, query, or credentials.');
    }
    $database = $env('DB_DATABASE', 'hubleto');
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $database)) {
        throw new RuntimeException('DB_DATABASE may contain only letters, numbers, and underscores.');
    }
    $email = $env('HUBLETO_ADMIN_EMAIL', 'admin@example.com');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('HUBLETO_ADMIN_EMAIL must be a valid email address.');
    }
    $password = $env('HUBLETO_ADMIN_PASSWORD');
    if ($password === '') {
        $password = bin2hex(random_bytes(16));
    }
    $uid = bin2hex(random_bytes(16));
    $config = [
        'release' => '',
        'sessionSalt' => $uid,
        'accountUid' => $uid,
        'accountFullName' => $env('HUBLETO_ACCOUNT_NAME', 'Hubleto'),
        'projectFolder' => $project,
        'releaseFolder' => $project,
        'logFolder' => $project . '/log',
        'uploadFolder' => $project . '/upload',
        'secureFolder' => $state . '/secure',
        'tmpFolder' => $state . '/tmp',
        'rewriteBase' => '/',
        'projectUrl' => $url,
        'uploadUrl' => $url . '/upload',
        'assetsUrl' => $url . '/vendor/hubleto/assets',
        'assetsCompiledUrl' => $url . '/vendor/hubleto/assets/compiled',
        'assetsThemesUrl' => $url . '/vendor/hubleto/assets/css/themes',
        'db_host' => 'db',
        'db_port' => 3306,
        'db_user' => $env('DB_USERNAME', 'hubleto'),
        'db_password' => $env('DB_PASSWORD', 'hubleto'),
        'db_name' => $database,
        'db_codepage' => 'utf8mb4',
        'global_table_prefix' => '',
        'appRepositories' => [],
        'develMode' => false,
        'locale' => ['timezone' => $env('TZ', 'UTC')],
        'language' => 'en',
        'env' => 'docker',
    ];

    $db = new PDO(
        'mysql:host=db;dbname=' . $database . ';charset=utf8mb4',
        $config['db_user'], $config['db_password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5],
    );
    if ((int) $db->query('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()')->fetchColumn() > 0) {
        throw new RuntimeException('The database is not empty. Refusing to run the destructive Hubleto installer.');
    }

    if (!is_dir($state . '/tmp') && !mkdir($state . '/tmp', 0700)) {
        throw new RuntimeException('Cannot create the temporary directory.');
    }
    if (!unlink($project . '/ConfigEnv.php')) {
        throw new RuntimeException('Cannot prepare the installer configuration.');
    }
    // Record the attempt before calling upstream, which creates config before dropping the DB.
    if (file_put_contents($state . '/initializing', date(DATE_ATOM) . "\n") === false) {
        throw new RuntimeException('Cannot write installation state.');
    }
    require $project . '/vendor/autoload.php';
    // Bootstrap like `php hubleto init`: connecting here would load roles from
    // tables that the installer has not created yet.
    $bootstrapConfig = $config;
    unset($bootstrapConfig['db_host']);
    $hubleto = new \Hubleto\Erp\Loader($bootstrapConfig);
    $hubleto->init();
    $command = $hubleto->getService(\Hubleto\Erp\Cli\Agent\CommandInit::class);
    $command->initConfig = [
        'accountUid' => $uid,
        'rewriteBase' => '/',
        'projectFolder' => $project,
        'releaseFolder' => $project,
        'secureFolder' => $config['secureFolder'],
        'projectUrl' => $url,
        'assetsUrl' => $config['assetsUrl'],
        'dbHost' => 'db',
        'dbUser' => $config['db_user'],
        'dbPassword' => $config['db_password'],
        'dbName' => $database,
        'dbCodepage' => 'utf8mb4',
        'accountFullName' => $config['accountFullName'],
        'adminName' => 'Hubleto',
        'adminFamilyName' => 'Administrator',
        'adminNick' => 'admin',
        'adminEmail' => $email,
        'adminPassword' => $password,
        'language' => 'en',
        'packagesToInstall' => $env('HUBLETO_PACKAGES', 'crm,marketing,sales,finance,help,maintenance'),
        'generateDemoData' => false,
        'noPrompt' => true,
    ];
    $command->setArguments(['hubleto', 'init'])->run();

    // Serialize values rather than using upstream's PHP template interpolation, so
    // quotes and backslashes in passwords and account names remain valid PHP.
    if (file_put_contents($state . '/ConfigEnv.php', "<?php\n\n\$config = " . var_export($config, true) . ";\n") === false
        || !rename($state . '/initializing', $state . '/initialized')) {
        throw new RuntimeException('Cannot save the completed installation state.');
    }
    echo "Hubleto installation completed.\n";
    $finished = true;
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
