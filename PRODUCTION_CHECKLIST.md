# Production Checklist

## Before deploy

- Set a real `SESSION_SECRET`
- Set `APP_BASE_URL`
- Confirm production database credentials
- Confirm database backups exist
- Verify `NODE_ENV=production`
- Review `TRUST_PROXY` for the hosting platform
- Seed or create the admin/support account you want to keep

## App checks

- Visit `/healthz`
- Visit `/readyz`
- Register a fresh account
- Log in and log out
- Request and complete a password reset
- Add, edit, and delete a bet
- Import a CSV file
- Export history and bankroll CSVs
- Add and remove a bankroll adjustment
- Check stats and history filters

## Launch pages

- Review `/privacy`
- Review `/terms`
- Add a support email or contact path before public launch
- Add any responsible-use disclaimer you want visible on the landing page

## Nice to have next

- Monitoring and error logging
- Analytics
- Subscription scaffolding
- Onboarding improvements
- Recap emails
