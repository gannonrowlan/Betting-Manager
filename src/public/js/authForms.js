(() => {
  const commonPasswords = new Set([
    '1234567890',
    '1111111111',
    '12345678',
    '123456789',
    'qwerty123',
    'password',
    'password1',
    'password123',
    'letmein',
    'admin123',
  ]);

  const formConfigs = {
    login: {
      messages: {
        email: {
          valueMissing: 'Enter your email address.',
          typeMismatch: 'Enter a valid email address.',
        },
        password: {
          valueMissing: 'Enter your password.',
        },
      },
    },
    register: {
      messages: {
        name: {
          valueMissing: 'Enter your name.',
        },
        email: {
          valueMissing: 'Enter your email address.',
          typeMismatch: 'Enter a valid email address.',
        },
        password: {
          valueMissing: 'Create a password.',
          tooShort: 'Password must be at least 10 characters.',
        },
        confirmPassword: {
          valueMissing: 'Confirm your password.',
        },
      },
      beforeValidate(input, form) {
        if (input.name === 'password') {
          const name = form.querySelector('[name="name"]')?.value || '';
          const email = form.querySelector('[name="email"]')?.value || '';

          if (input.value && passwordContainsPersonalInfo(input.value, name, email)) {
            input.setCustomValidity('Password cannot include your name or email.');
            return;
          }

          if (input.value && commonPasswords.has(input.value.toLowerCase())) {
            input.setCustomValidity('Choose a less common password.');
            return;
          }

          input.setCustomValidity('');
          return;
        }

        if (input.name !== 'confirmPassword') {
          return;
        }

        const password = form.querySelector('[name="password"]');
        if (input.value && password && input.value !== password.value) {
          input.setCustomValidity('Passwords do not match.');
          return;
        }

        input.setCustomValidity('');
      },
      afterInput(input, form) {
        if (input.name !== 'password') {
          return;
        }

        const confirmPassword = form.querySelector('[name="confirmPassword"]');
        if (confirmPassword) {
          validateField(confirmPassword, form, formConfigs.register);
        }
      },
    },
  };

  function passwordContainsPersonalInfo(password, name, email) {
    const normalizedPassword = password.toLowerCase();
    const normalizedEmail = email.toLowerCase();
    const emailLocalPart = normalizedEmail.split('@')[0] || '';
    const nameParts = name
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.replace(/[^a-z0-9]/g, ''))
      .filter((part) => part.length >= 3);

    if (normalizedEmail && normalizedPassword.includes(normalizedEmail)) {
      return true;
    }

    if (emailLocalPart.length >= 3 && normalizedPassword.includes(emailLocalPart)) {
      return true;
    }

    return nameParts.some((part) => normalizedPassword.includes(part));
  }

  function validateField(input, form, config) {
    const error = form.querySelector(`[data-error-for="${input.name}"]`);
    if (!error) {
      return;
    }

    if (config.beforeValidate) {
      config.beforeValidate(input, form);
    }

    if (input.validity.valid) {
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      return;
    }

    const fieldMessages = config.messages[input.name] || {};
    let message = input.validationMessage || 'Check this field.';

    Object.keys(fieldMessages).some((key) => {
      if (input.validity[key]) {
        message = fieldMessages[key];
        return true;
      }
      return false;
    });

    if (input.name === 'confirmPassword' && input.validationMessage === 'Passwords do not match.') {
      message = 'Passwords do not match.';
    }

    input.setAttribute('aria-invalid', 'true');
    error.textContent = message;
  }

  document.querySelectorAll('[data-auth-form]').forEach((form) => {
    const mode = form.dataset.authForm;
    const config = formConfigs[mode];

    if (!config) {
      return;
    }

    form.querySelectorAll('[data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        validateField(input, form, config);

        if (config.afterInput) {
          config.afterInput(input, form);
        }

        if (mode === 'register' && (input.name === 'name' || input.name === 'email')) {
          const passwordInput = form.querySelector('[name="password"]');
          if (passwordInput && passwordInput.value) {
            validateField(passwordInput, form, config);
          }
        }
      });

      input.addEventListener('blur', () => validateField(input, form, config));
      input.addEventListener('invalid', (event) => {
        event.preventDefault();
        validateField(input, form, config);
      });
    });

    form.addEventListener('submit', (event) => {
      let hasError = false;

      form.querySelectorAll('[data-field]').forEach((input) => {
        validateField(input, form, config);
        if (!input.validity.valid) {
          hasError = true;
        }
      });

      if (hasError) {
        event.preventDefault();
        return;
      }

      const submitButton = form.querySelector('[data-submit-button]');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = submitButton.dataset.pendingLabel || 'Submitting...';
      }
    });
  });

  document.querySelectorAll('[data-password-toggle]').forEach((button) => {
    const inputId = button.getAttribute('data-password-toggle');
    const input = document.getElementById(inputId);

    if (!input) {
      return;
    }

    button.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      button.textContent = isPassword ? 'Hide' : 'Show';
      button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  });
})();
