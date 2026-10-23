module.exports = {
  apps: [
    {
      name: "student-growth-backend",
      cwd: "/usr/local/student_growth/backend",
      script: "app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 9000
      },
      error_file: "/usr/local/student_growth/logs/pm2-err.log",
      out_file: "/usr/local/student_growth/logs/pm2-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
