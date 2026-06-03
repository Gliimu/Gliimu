// Create indexes for faster queries
db = db.getSiblingDB('gliimu');

// Users
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });

// Applications
db.applications.createIndex({ email: 1 });
db.applications.createIndex({ status: 1 });
db.applications.createIndex({ createdAt: -1 });

// Transactions
db.transactions.createIndex({ userId: 1 });
db.transactions.createIndex({ status: 1 });
db.transactions.createIndex({ createdAt: -1 });

// Assignments
db.assignments.createIndex({ createdBy: 1 });
db.assignments.createIndex({ dueDate: 1 });

// Submissions
db.submissions.createIndex({ assignmentId: 1 });
db.submissions.createIndex({ studentUsername: 1 });

// Messages
db.messages.createIndex({ roomId: 1 });
db.messages.createIndex({ createdAt: -1 });

// Materials
db.materials.createIndex({ type: 1 });
db.materials.createIndex({ price: 1 });

// Notifications
db.notifications.createIndex({ userId: 1 });
db.notifications.createIndex({ read: 1 });
db.notifications.createIndex({ createdAt: -1 });

print('✅ Indexes created');