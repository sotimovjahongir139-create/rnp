<?php
// Copy to production_push.config.php on the cPanel box and fill in real values.
// The real config (with secrets) must NEVER be committed.
return [
  'db_host'            => 'localhost',
  'db_port'            => 3306,
  'db_name'            => 'arconper_arcon',
  'db_user'            => 'arconper_ro',
  'db_pass'            => 'REPLACE_WITH_arconper_ro_PASSWORD',   // from odin:~/rnp/factory-access.env
  // Until DNS for rnp.arcon-group.uz points at odin (62.169.31.240), post to the IP over HTTP
  // and set ingest_host_header so nginx routes to the rnp vhost. After DNS+TLS, switch to the https URL.
  'ingest_url'         => 'https://rnp.arcon-group.uz/api/ingest/production',
  'ingest_host_header' => null,        // e.g. 'rnp.arcon-group.uz' when using a bare-IP http URL
  'ingest_secret'      => 'REPLACE_WITH_INGEST_SECRET',          // from odin:~/rnp/.env INGEST_SECRET
  'verify_tls'         => true,        // false only if posting to a bare IP with a non-matching cert
];
