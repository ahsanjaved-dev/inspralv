/**
 * Google Calendar Reminder Information
 * 
 * EMAIL REMINDERS ARE HANDLED AUTOMATICALLY BY GOOGLE CALENDAR!
 * 
 * When we create an event with attendees and reminder settings:
 * 
 * 1. INVITATION EMAIL
 *    - Google automatically sends an invitation to all attendees
 *    - Attendees can Accept/Decline/Maybe
 *    - The event is added to their calendar
 * 
 * 2. REMINDER EMAILS
 *    - Based on the event's reminder settings (24h and 1h)
 *    - Google sends email reminders automatically
 *    - No cron job or manual sending required
 * 
 * 3. UPDATE EMAILS
 *    - When event is rescheduled, Google notifies attendees
 *    - We use sendUpdates=all in our API calls
 * 
 * 4. CANCELLATION EMAILS
 *    - When event is deleted, Google notifies attendees
 *    - We use sendUpdates=all in our delete calls
 * 
 * The reminder settings in our config (send_24h_reminder, send_1h_reminder)
 * control whether these reminders are added to the Google Calendar event.
 * 
 * NO CRON JOB NEEDED - Google handles everything! 🎉
 */

// This file is kept for documentation purposes only.
// All reminder functionality is handled by Google Calendar automatically.
