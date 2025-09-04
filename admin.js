
    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;

      // Get today's date in ddmmyyyy format
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-based
      const yyyy = today.getFullYear();
      const currentDatePassword = 'admin' + dd ;

      if(username === 'admin' && password === currentDatePassword) {
        window.location.href = 'https://streamvibe-18.vercel.app/';
      } else {
        alert('Invalid username or password');
      }
    });

