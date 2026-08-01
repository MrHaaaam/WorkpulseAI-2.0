import { MongoClient } from "mongodb";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("Error: MONGODB_URI is not defined in your .env file.");
  process.exit(1);
}

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// NOTE: Frontend expects a richer employee object shape:
// - role: "employee" | "extra" | string
// - casualLeave/sickLeave: { total, used }
// - biometricStatus: "enrolled" | "pending" | "none"
// - status: "active" | "on-leave" | "inactive"
//
// Also, RBAC roles are:
// - admin, manager, employee
// Here we map employee.status to availability and role to "employee"/"extra" buckets.
const EMPLOYEE_ROLE_BUCKETS = ["employee", "extra"];
const BIOMETRIC_STATUSES = ["enrolled", "pending", "none"];
const EMPLOYEE_STATUSES = ["active", "on-leave", "inactive"];
const REDFLAG_DAILY_WEIGHTS = {
  casual: 1,
  sick: 2,
};

const PERSON_POOL = [
  "Sarah Jenkins",
  "Marcus Vance",
  "Elena Rostova",
  "David Kim",
  "Ava Robinson",
  "Noah Peterson",
  "Mia Thompson",
  "Ethan Walker",
  "Olivia Harris",
  "Liam Turner",
  "Sophia Phillips",
  "James Martin",
  "Amelia Scott",
  "Benjamin Adams",
  "Isabella Baker",
];

const TITLES_POOL = [
  "Frontend Engineer",
  "Backend Engineer",
  "QA Engineer",
  "DevOps Engineer",
  "UI/UX Designer",
  "Data Analyst",
  "Product Engineer",
  "Mobile Engineer",
  "Support Engineer",
];

const makeEmployee = (idx) => {
  const id = `EMP-${String(idx + 1).padStart(3, "0")}`;
  const name = PERSON_POOL[idx % PERSON_POOL.length];
  const roleBucket = EMPLOYEE_ROLE_BUCKETS[idx % EMPLOYEE_ROLE_BUCKETS.length];
  const title = TITLES_POOL[(idx * 3) % TITLES_POOL.length];

  const casualTotal = 10;
  const sickTotal = 10;
  const casualUsed = randomInt(0, 10);
  const sickUsed = randomInt(0, 10);

  const status = EMPLOYEE_STATUSES[(idx * 7) % EMPLOYEE_STATUSES.length];
  const biometricStatus = BIOMETRIC_STATUSES[(idx * 5) % BIOMETRIC_STATUSES.length];

  // Base salary by roleBucket + title noise
  const base = roleBucket === "employee" ? 60000 : 52000;
  const grossSalary = clamp(base + idx * 2100 + randomInt(-2500, 2500), 42000, 120000);

  return {
    id,
    name,
    // Keep role as expected bucket value, not the job title
    role: roleBucket,
    // Store title too if your backend/frontend later needs it
    title,
    grossSalary: Math.round(grossSalary),
    status,
    casualLeave: { total: casualTotal, used: casualUsed },
    sickLeave: { total: sickTotal, used: sickUsed },
    biometricStatus,
    // Optional: compute a naive red-flag score; frontend now uses leave credits directly,
    // but this helps if you extend later.
    redFlagsDaily: casualUsed * REDFLAG_DAILY_WEIGHTS.casual + sickUsed * REDFLAG_DAILY_WEIGHTS.sick,
  };
};

// Minimum 5, maximum 15 employees
const EMPLOYEE_COUNT = 10;
const fakeEmployees = Array.from({ length: EMPLOYEE_COUNT }, (_, idx) => makeEmployee(idx));

// Attendance rows for the current table UI
// AttendanceView expects: employeeId, name, role, date, checkIn, checkOut, status
const fakeAttendance = (() => {
  // pick 5 days per employee
  const days = ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"];
  const statuses = ["Present", "Late", "Absent", "On Leave"];

  return fakeEmployees.flatMap((emp, empIdx) => {
    return days.map((date, dayIdx) => {
      const roll = (empIdx + dayIdx) % statuses.length;
      const status = statuses[roll];

      // If On Leave/Absent, keep times as placeholders
      const checkIn = status === "Present" || status === "Late" ? `0${8 + dayIdx}:1${dayIdx}`.replace("::", ":") : "—";
      const checkOut = status === "Present" || status === "Late" ? `1${7 + dayIdx}:0${dayIdx % 6}`.replace("::", ":") : "—";

      return {
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        date,
        checkIn,
        checkOut,
        status,
      };
    });
  });
})();

const fakePayrollRequests = [
  {
    id: "PR-201",
    employeeId: "EMP-001",
    employeeName: "Sarah Jenkins",
    amount: 47500,
    status: "processing"
  },
  {
    id: "PR-202",
    employeeId: "EMP-002",
    employeeName: "Marcus Vance",
    amount: 41000,
    status: "approved"
  },
  {
    id: "PR-203",
    employeeId: "EMP-003",
    employeeName: "Elena Rostova",
    amount: 37500,
    status: "rejected"
  }
];

const fakeLeaveRequests = [
  {
    id: "LR-101",
    employeeName: "Sarah Jenkins",
    role: "Senior Frontend Engineer",
    leaveType: "Annual Leave",
    startDate: "2026-07-20",
    endDate: "2026-07-24",
    totalDays: 5,
    reason: "Family trip to Hawaii. Flights and hotel are already booked.",
    status: "pending",
    initials: "SJ"
  },
  {
    id: "LR-102",
    employeeName: "Marcus Vance",
    role: "Sick Leave",
    startDate: "2026-07-16",
    endDate: "2026-07-17",
    totalDays: 2,
    reason: "Dental procedure scheduled. Recovering at home.",
    status: "pending",
    initials: "MV"
  },
  {
    id: "LR-103",
    employeeName: "Elena Rostova",
    role: "QA Lead",
    leaveType: "Personal Leave",
    startDate: "2026-07-28",
    endDate: "2026-07-28",
    totalDays: 1,
    reason: "Moving to a new apartment. Need the day to coordinate movers.",
    status: "approved",
    initials: "ER"
  },
  {
    id: "LR-104",
    employeeName: "David Kim",
    role: "DevOps Engineer",
    leaveType: "Annual Leave",
    startDate: "2026-08-03",
    endDate: "2026-08-14",
    totalDays: 10,
    reason: "Summer vacation back home to visit grandparents.",
    status: "rejected",
    initials: "DK"
  }
];

async function seedDatabase() {
  const client = new MongoClient(uri);

  try {
    console.log("Connecting to MongoDB Atlas...");
    await client.connect();
    console.log("Connected successfully!");

    const db = client.db(); 

    console.log("Wiping out old collections...");
    await db.collection("employees").deleteMany({});
    await db.collection("payroll_requests").deleteMany({});
    await db.collection("leave_requests").deleteMany({});
    await db.collection("attendance").deleteMany({});

    console.log("Inserting fake employees...");
    await db.collection("employees").insertMany(fakeEmployees);

    console.log("Inserting fake payroll requests...");
    await db.collection("payroll_requests").insertMany(fakePayrollRequests);

    console.log("Inserting fake leave requests...");
    await db.collection("leave_requests").insertMany(fakeLeaveRequests);

    console.log("Inserting fake attendance...");
    await db.collection("attendance").insertMany(fakeAttendance);

    console.log("\x1b[32m%s\x1b[0m", "🎉 Success! Database populated with fresh 'fake data'.");
  } catch (error) {
    console.error("❌ An error occurred while seeding the database:", error);
  } finally {
    await client.close();
    console.log("Database connection closed.");
  }
}

seedDatabase();