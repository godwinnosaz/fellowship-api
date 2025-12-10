# TCCF Fellowship API

Backend API server for the TCCF Fellowship Manager application.

## Overview

This is a Node.js/Express server that provides RESTful API endpoints for managing fellowship operations including:

- User authentication and authorization
- Session management
- Task management
- Event and calendar management
- Financial transactions and expense tracking
- First-timer registration and follow-up
- Attendance tracking
- Resource management
- Music and worship planning
- Prayer requests
- Member management

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **SMS Service**: Integration for notifications
- **Firebase**: For additional services

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL database
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/godwinnosaz/fellowship-api.git
cd fellowship-api
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the values with your configuration:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/fellowship_db"
JWT_SECRET="your-secret-key"
PORT=3000
# Add other required environment variables
```

4. Set up the database:
```bash
npx prisma migrate dev
npx prisma generate
```

5. (Optional) Seed the database:
```bash
node seed.js
```

## Running the Server

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on the port specified in your `.env` file (default: 3000).

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - User registration
- `POST /password/request-reset` - Request password reset
- `POST /password/reset` - Reset password

### Sessions
- `GET /sessions` - Get all sessions
- `POST /sessions` - Create new session
- `PUT /sessions/:id/activate` - Activate session

### Tasks
- `GET /tasks` - Get all tasks
- `POST /tasks` - Create new task
- `PUT /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task

### Events
- `GET /events` - Get all events
- `POST /events` - Create new event
- `PUT /events/:id` - Update event
- `DELETE /events/:id` - Delete event
- `PUT /events/:id/approve` - Approve event

### Financial Transactions
- `GET /transactions` - Get all transactions
- `POST /transactions` - Create new transaction
- `PUT /transactions/:id/approve` - Approve transaction

### First Timers
- `GET /first-timers` - Get all first timers
- `POST /first-timers` - Register first timer
- `POST /first-timers/:id/follow-up` - Add follow-up note

### Calendar Events
- `GET /calendar-events` - Get calendar events
- `POST /calendar-events` - Create calendar event

### Media Posts
- `GET /media-posts` - Get media posts
- `POST /media-posts` - Create media post

### Attendance
- `GET /attendance` - Get attendance records
- `POST /attendance` - Record attendance

### Members
- `GET /members` - Get all members
- `GET /members/:id` - Get member profile
- `PUT /members/:id` - Update member

### Users
- `GET /users` - Get all users

### Prayer Requests
- `GET /prayer-requests` - Get prayer requests
- `POST /prayer-requests` - Create prayer request
- `PUT /prayer-requests/:id` - Update prayer request

## Database Schema

The database schema is managed using Prisma. See `prisma/schema.prisma` for the complete schema definition.

### Main Models:
- Fellowship
- User
- Session
- Task
- Event
- Transaction
- FirstTimer
- FollowUp
- CalendarEvent
- MediaPost
- Attendance
- Member
- PrayerRequest
- Song
- Resource
- Announcement

## Middleware

### Authentication (`middleware/auth.js`)
JWT-based authentication middleware for protected routes.

### File Upload (`middleware/upload.js`)
Multer middleware for handling file uploads.

## Services

### Firebase (`services/firebase.js`)
Firebase integration for additional services.

### SMS (`services/sms.js`)
SMS notification service integration.

## Utilities

### Authentication Utils (`utils/auth.js`)
Helper functions for password hashing and JWT token generation/verification.

## Testing

Test files are included:
- `test-phase1.js` - Phase 1 testing
- `test_login.js` - Login functionality testing
- `check_users.js` - User verification

## Project Structure

```
fellowship-api/
├── index.js              # Main server file
├── package.json          # Dependencies and scripts
├── .env.example          # Environment variables template
├── .gitignore           # Git ignore rules
├── middleware/          # Express middleware
│   ├── auth.js         # Authentication middleware
│   └── upload.js       # File upload middleware
├── services/           # External services
│   ├── firebase.js    # Firebase integration
│   └── sms.js        # SMS service
├── utils/             # Utility functions
│   └── auth.js       # Auth utilities
├── prisma/           # Database schema
│   └── schema.prisma # Prisma schema definition
├── seed.js          # Database seeding script
└── uploads/         # Uploaded files directory
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is part of the TCCF Fellowship Manager application.

## Contact

For questions or support, please contact the development team.
