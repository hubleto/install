<?php declare(strict_types=1);

$state = '/var/lib/hubleto';
$project = dirname(__DIR__);
chdir($project);
umask(0077);
$lock = fopen("$state/init.lock", 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    fwrite(STDERR, "Another initializer is running.\n");
    exit(1);
}
if (is_file("$state/initialized") && is_file("$state/ConfigEnv.php")) {
    echo "Hubleto is already initialized.\n";
    exit(0);
}
// The upstream installer can exit with 0 on failure. Only our completion marker means success.
register_shutdown_function(static function () use ($state): void {
    if (!is_file("$state/initialized")) exit(1);
});

try {
    if (is_file("$state/initializing") || is_file("$state/ConfigEnv.php") || is_file("$state/initialized")) {
        throw new RuntimeException('Incomplete installation; restore a backup before retrying.');
    }
    $url = rtrim(getenv('HUBLETO_URL') ?: 'http://localhost:8080', '/');
    $password = getenv('HUBLETO_ADMIN_PASSWORD');
    $uid = bin2hex(random_bytes(16));
    $config = [
        'projectFolder' => $project,
        'releaseFolder' => $project,
        'rewriteBase' => '/',
        'projectUrl' => $url,
        'assetsUrl' => "$url/vendor/hubleto/assets",
        'uploadUrl' => "$url/upload",
        'uploadFolder' => "$project/upload",
        'logFolder' => "$project/log",
        'secureFolder' => "$state/secure",
        'sessionSalt' => $uid,
        'accountUid' => $uid,
        'accountFullName' => 'Hubleto',
        'db_host' => 'db',
        'db_port' => 3306,
        'db_name' => getenv('DB_DATABASE') ?: 'hubleto',
        'db_user' => getenv('DB_USERNAME') ?: 'hubleto',
        'db_password' => getenv('DB_PASSWORD') === false ? 'hubleto' : getenv('DB_PASSWORD'),
        'db_codepage' => 'utf8mb4',
        'appRepositories' => [],
        'develMode' => false,
    ];
    if (!preg_match('/^[a-zA-Z0-9_]+$/', $config['db_name'])) {
        throw new RuntimeException('Database name may contain only letters, numbers, and underscores.');
    }
    $db = new PDO('mysql:host=db;dbname=' . $config['db_name'], $config['db_user'], $config['db_password']);
    if ($db->query('SHOW TABLES')->fetchColumn() !== false) {
        throw new RuntimeException('Database is not empty; refusing to run the destructive installer.');
    }
    file_put_contents("$state/initializing", date(DATE_ATOM));
    unlink("$project/ConfigEnv.php");
    require "$project/vendor/autoload.php";
    // Start without a DB connection: the application's tables do not exist yet.
    $hubleto = new \Hubleto\Erp\Loader(['projectFolder' => $project, 'secureFolder' => "$state/secure", 'sessionSalt' => $uid]);
    $hubleto->init();
    $command = $hubleto->getService(\Hubleto\Erp\Cli\Agent\CommandInit::class);
    $command->initConfig = [
        'accountUid' => $uid,
        'rewriteBase' => '/',
        'projectFolder' => $project,
        'releaseFolder' => $project,
        'secureFolder' => "$state/secure",
        'projectUrl' => $url,
        'assetsUrl' => $config['assetsUrl'],
        'dbHost' => 'db', 'dbName' => $config['db_name'],
        'dbUser' => $config['db_user'], 'dbPassword' => $config['db_password'],
        'dbCodepage' => 'utf8mb4',
        'accountFullName' => 'Hubleto',
        'adminName' => 'Hubleto', 'adminFamilyName' => 'Administrator', 'adminNick' => 'admin',
        'adminEmail' => getenv('HUBLETO_ADMIN_EMAIL') ?: 'admin@example.com',
        'adminPassword' => $password === false || $password === '' ? bin2hex(random_bytes(16)) : $password,
        'packagesToInstall' => 'crm,marketing,sales,finance,help,maintenance',
        'language' => 'en', 'generateDemoData' => false, 'noPrompt' => true,
    ];
    $command->setArguments(['hubleto', 'init'])->run();
    // Export actual values safely, including passwords containing quotes or backslashes.
    if (file_put_contents("$state/ConfigEnv.php", "<?php\n\$config = " . var_export($config, true) . ";\n") === false
        || !rename("$state/initializing", "$state/initialized")) {
        throw new RuntimeException('Could not save installation configuration.');
    }
    echo "Hubleto installation completed.\n";
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}
