FROM postgres:15-alpine
RUN apk add --no-cache tzdata rclone \
 && cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime \
 && echo "America/Sao_Paulo" > /etc/timezone
COPY backup.sh /usr/local/bin/backup.sh
COPY crontab /etc/crontabs/root
RUN chmod +x /usr/local/bin/backup.sh \
 && chmod 600 /etc/crontabs/root \
 && mkdir -p /backups /etc/rclone
ENV TZ=America/Sao_Paulo RCLONE_CONFIG=/etc/rclone/rclone.conf
CMD ["crond", "-f", "-l", "2"]
