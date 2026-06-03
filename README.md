# Gliimu Institute of Media Technologies

![Gliimu Logo](frontend/icons/logo.png)

**Full-Stack Media Production Diploma | Abuja, Nigeria**

A complete Learning Management System (LMS) with integrated marketplace, real-time chat, live classroom, and wallet payment system.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Overview

Gliimu is an educational technology platform offering a **Diploma in Full-Stack Media Production**. The platform combines:

- 🎓 Student application & enrollment
- 💳 Wallet system with Paystack integration
- 📚 Digital marketplace (books, resources)
- 💬 Real-time community chat
- 🎥 Live classroom with WebRTC
- 📝 Assignment submission & grading
- 👨‍🏫 Instructor & Admin portals

Built for scalability from day one — handles 100 to 10,000+ users.

---

## Features

### 🧑‍🎓 Student Portal
- Dashboard with progress tracking
- Wallet (top-up, purchases, withdrawal requests)
- Library (buy & download digital materials)
- Assignment submission (files, images, docs)
- Performance analytics & grades
- Digital ID card with QR code
- Live classroom (view-only mode)
- Community chat

### 👨‍🏫 Instructor Portal
- Create & manage assignments
- Grade submissions with feedback
- View assigned students
- Live classroom (broadcast with screen share)
- Whiteboard with real-time sync
- Wallet (earnings, withdrawal)
- Upload learning materials

### 👑 Admin Portal
- User management (CRUD, roles)
- Finance dashboard (approve top-ups, withdrawals)
- Admission control (open/close applications)
- Scholarship toggles (Work n' Pay, Early Bird)
- Hub content management
- System settings
- Real-time notifications

### 💬 Real-time Features
- Community chat (Socket.io)
- Private messaging (Admin/Instructor to Student)
- Live classroom (PeerJS WebRTC)
- Whiteboard sync across participants
- Typing indicators
- Online/offline presence

### 💳 Payment System
- Paystack integration (cards, bank transfer, USSD)
- Wallet as internal currency
- Manual receipt upload (fallback)
- Automated wallet crediting via webhook
- Withdrawal requests to bank accounts

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| HTML5, CSS3, Vanilla JS | Core structure (no framework lock-in) |
| Socket.IO Client | Real-time chat & notifications |
| PeerJS | WebRTC for live classroom |
| Font Awesome | Icons |
| Google Fonts (Inter) | Typography |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js + Express | REST API server |
| MongoDB + Mongoose | Primary database |
| Supabase | File storage (assignments, receipts, materials) |
| Socket.IO | Real-time signaling |
| JWT | Authentication |
| bcrypt | Password hashing |

### Third-Party Services
| Service | Purpose |
|---------|---------|
| Paystack | Payment processing (Nigeria) |
| Stripe | Alternative/global payments |
| Resend / Brevo | Email notifications |
| Render | Backend hosting |
| Vercel | Frontend hosting |
| MongoDB Atlas | Cloud database |
| Cloudflare | CDN & DNS |

---

## Folder Structure
/gliimu-project/
│
├── /frontend/ # All static files
│ ├── /css/
│ │ ├── global.css
│ │ ├── header.css
│ │ ├── dashboard.css
│ │ ├── library.css
│ │ └── classroom.css
│ ├── /js/
│ │ ├── /modules/
│ │ │ ├── auth.js
│ │ │ ├── api.js
│ │ │ ├── wallet.js
│ │ │ ├── chat.js
│ │ │ └── classroom.js
│ │ └── /pages/
│ │ ├── index.js
│ │ ├── user.js
│ │ ├── instructor.js
│ │ └── admin.js
│ ├── /icons/ # Logos, favicons
│ ├── /photos/ # Images, banners
│ ├── /partials/ # Reusable HTML
│ │ ├── header.html
│ │ ├── footer.html
│ │ └── login-modal.html
│ ├── index.html
│ ├── application.html
│ ├── user.html
│ ├── instructor.html
│ ├── dashtypex.html (admin)
│ ├── library.html
│ ├── livearea.html
│ ├── classroom.html
│ └── ... (other pages)
│
├── /backend/
│ ├── /routes/ # API endpoints
│ ├── /models/ # Mongoose schemas
│ ├── /middleware/ # Auth, validation
│ ├── /services/ # Email, storage, payment
│ ├── /sockets/ # Socket.io handlers
│ ├── /config/ # DB, env config
│ ├── /uploads/ # Temp file storage
│ ├── server.js # Entry point
│ ├── package.json
│ └── .env
│
├── /database/
│ └── /backups/ # MongoDB dumps
│
├── /docs/
│ ├── API.md # Endpoint documentation
│ ├── DEPLOYMENT.md # Deployment guide
│ └── SCHEMA.md # Database schema
│
├── .gitignore
├── README.md
└── docker-compose.yml # Local development


---

## Installation

### Prerequisites

- Node.js (v18 or higher)
- MongoDB Atlas account (free)
- Supabase account (free)
- Paystack account (for payments)
- Git

### Step 1: Clone the Repository

```bash
git clone https://github.com/gliimu/gliimu.git
cd gliimu
