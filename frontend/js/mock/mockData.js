// Mock user data
export const mockUsers = {
  student: {
    id: "stu_001",
    username: "student_demo",
    name: "Demo Student",
    email: "student@gliimu.com",
    role: "Student",
    track: "Media Track",
    avatar: "https://ui-avatars.com/api/?name=Demo+Student&background=random",
    walletBalance: 25000,
    enrolledCourses: ["Media Production 101", "Video Editing", "Sound Design"],
    assignments: [
      { id: "as1", title: "Short Film Project", dueDate: "2025-03-20", status: "pending", grade: null },
      { id: "as2", title: "Color Grading Exercise", dueDate: "2025-03-25", status: "submitted", grade: 85 }
    ],
    transactions: [
      { id: "tx1", amount: 25000, type: "credit", date: "2025-03-01", status: "approved", description: "Tuition Payment" },
      { id: "tx2", amount: 5000, type: "debit", date: "2025-03-05", status: "approved", description: "Book Purchase" }
    ]
  },
  instructor: {
    id: "ins_001",
    username: "instructor_demo",
    name: "Demo Instructor",
    email: "instructor@gliimu.com",
    role: "Instructor",
    avatar: "https://ui-avatars.com/api/?name=Demo+Instructor&background=random",
    walletBalance: 150000,
    students: [
      { id: "stu_001", name: "John Doe", email: "john@example.com", track: "Media", submissions: 3, completed: 2 },
      { id: "stu_002", name: "Jane Smith", email: "jane@example.com", track: "Tech", submissions: 5, completed: 4 }
    ],
    assignments: [
      { id: "as1", title: "Short Film Project", dueDate: "2025-03-20", submissions: 8, graded: 5 },
      { id: "as2", title: "UI/UX Design Challenge", dueDate: "2025-03-28", submissions: 12, graded: 3 }
    ]
  },
  admin: {
    id: "adm_001",
    username: "admin",
    name: "Super Admin",
    email: "admin@gliimu.com",
    role: "Admin",
    avatar: "https://ui-avatars.com/api/?name=Super+Admin&background=random"
  }
};

// Mock library materials
export const mockLibrary = [
  {
    id: "lib_001",
    type: "book",
    title: "Complete Guide to Video Production",
    price: 3500,
    about: "Master professional video production from pre-production to final delivery.",
    imageUrl: "https://via.placeholder.com/300x450?text=Video+Production",
    fileUrl: "#",
    sampleUrl: "#",
    category: "video"
  },
  {
    id: "lib_002",
    type: "book",
    title: "UI/UX Design Mastery",
    price: 2800,
    about: "Learn the fundamentals of user interface and experience design.",
    imageUrl: "https://via.placeholder.com/300x450?text=UI+UX+Design",
    fileUrl: "#",
    sampleUrl: "#",
    category: "design"
  },
  {
    id: "lib_003",
    type: "bundle",
    title: "Full-Stack Web Development Bundle",
    price: 15000,
    about: "Complete web development resources including HTML, CSS, JavaScript, React, and Node.js",
    fileUrl: "#",
    meta: "5 courses + 10 projects",
    category: "code"
  }
];

// Mock hub content
export const mockHub = [
  { type: "event", title: "Media Tech Summit 2025", date: "MAR 15", location: "Gliimu Campus", price: "Free", image: "/photos/event1.jpg" },
  { type: "insight", title: "The Future of AI in Media", date: "Feb 28, 2025", duration: "5 min read", image: "/photos/insight1.jpg", subcategory: "video" },
  { type: "support", title: "Scholarship Fund", text: "Help talented students who can't afford tuition.", icon: "fa-hand-holding-heart", btnText: "Donate Now" }
];

// Mock forum messages
export const mockMessages = [
  { id: "msg_001", sender: "student_demo", senderName: "Demo Student", text: "Hello everyone!", type: "text", timestamp: new Date().toISOString() },
  { id: "msg_002", sender: "instructor_demo", senderName: "Demo Instructor", text: "Welcome to the community!", type: "text", timestamp: new Date().toISOString() }
];

// Mock online users
export const mockOnlineUsers = [
  { username: "student_demo", name: "Demo Student", role: "Student" },
  { username: "instructor_demo", name: "Demo Instructor", role: "Instructor" }
];