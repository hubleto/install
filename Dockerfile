# syntax=docker/dockerfile:1

FROM php:8.4-fpm-bookworm AS php-base

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git unzip libicu-dev libzip-dev libpng-dev libjpeg62-turbo-dev \
        libfreetype6-dev libc-client2007e-dev libkrb5-dev libssl-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" bcmath gd intl mysqli pdo_mysql zip opcache \
    && pecl install imap-1.0.3 \
    && docker-php-ext-enable imap \
    && rm -rf /var/lib/apt/lists/* /tmp/pear

COPY docker/php.ini /usr/local/etc/php/conf.d/hubleto.ini
WORKDIR /var/www/hubleto

FROM php-base AS dependencies
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY composer.* ./
RUN COMPOSER_ALLOW_SUPERUSER=1 composer install \
    --no-dev --prefer-dist --no-interaction --no-progress --no-autoloader \
    && test -s vendor/hubleto/assets/compiled/js/main.js \
    && test -s vendor/hubleto/assets/compiled/css/main.css
COPY . .
RUN COMPOSER_ALLOW_SUPERUSER=1 composer dump-autoload --no-dev --optimize

FROM php-base AS app
COPY --from=dependencies --chown=www-data:www-data /var/www/hubleto /var/www/hubleto
COPY docker/ConfigEnv.php /var/www/hubleto/ConfigEnv.php
# Use the same bootstrap files a normal `hubleto init` generates. The init
# container's writable layer is separate from the application container's layer.
RUN for script in boot index cron; do \
        cp "vendor/hubleto/erp/installer/Templates/$script.php.tpl" "$script.php"; \
    done \
    && mkdir -p /var/lib/hubleto/secure /var/www/hubleto/upload /var/www/hubleto/log \
    && chown www-data:www-data /var/www/hubleto \
    && chown -R www-data:www-data /var/lib/hubleto /var/www/hubleto/upload /var/www/hubleto/log
USER www-data
CMD ["php-fpm"]

FROM nginx:1.28-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=dependencies /var/www/hubleto/vendor/hubleto/assets /var/www/hubleto/vendor/hubleto/assets
