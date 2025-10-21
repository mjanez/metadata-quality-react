# Update SSL Certificate
To update the local SSL certificate, follow these steps:

1. Generate a new certificate and private key:
```sh
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/mqa_local.key \
  -out docker/nginx/ssl/mqa_local.crt \
  -subj "/C=ES/ST=Madrid/L=Madrid/O=Development/CN=localhost"
```

2. Verify that the files have been created correctly:
```sh
ls -l docker/nginx/ssl/mqa_local.*
```

3. Restart the `nginx` container to apply the changes:
```sh
docker compose restart nginx
```

> [!CAUTION]
> This certificate is for local development only. In production, use a valid certificate from a certificate authority.