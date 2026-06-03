#!/bin/bash

# database/backup.sh

BACKUP_DIR="./database/backups"
DATE=$(date +"%Y%m%d_%H%M%S")
FILENAME="gliimu_backup_$DATE"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Run mongodump (requires MongoDB tools installed)
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/$FILENAME"

# Compress the backup
cd $BACKUP_DIR
tar -czf "$FILENAME.tar.gz" "$FILENAME"
rm -rf "$FILENAME"

echo "✅ Backup created: $BACKUP_DIR/$FILENAME.tar.gz"

# Optional: Delete backups older than 30 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete