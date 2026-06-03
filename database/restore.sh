#!/bin/bash

# database/restore.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore.sh filename.tar.gz"
  exit 1
fi

BACKUP_DIR="./database/backups/restore_temp"

# Create temp directory
mkdir -p $BACKUP_DIR

# Extract backup
tar -xzf "./database/backups/$BACKUP_FILE" -C $BACKUP_DIR

# Find extracted folder name
EXTRACTED_DIR=$(ls $BACKUP_DIR)

# Restore to MongoDB
mongorestore --uri="$MONGODB_URI" --drop "$BACKUP_DIR/$EXTRACTED_DIR"

# Clean up
rm -rf $BACKUP_DIR

echo "✅ Restored from: $BACKUP_FILE"