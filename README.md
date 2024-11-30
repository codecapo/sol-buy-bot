# Todo

- Finish of execution order feature
  - Save random wallet execution range into database
  - Execution order management
    - Maintain a list of market maker wallets where the swap has been performed in that batch
    - Implement checks to ensure all market maker wallets within the batch has performed a swap
    - Create a scheduler that triggers a execution order every 5 seconds on the remaining schedulers
  - 