## Filtering Display Output

If you want to control which events are displayed in the terminal separately from which events are recorded (when using `recordLogs`), you can use the `displayFilter` option:
```js
module.exports = (on, config) => {
  /** the rest of your plugins... **/
  const options = {
    recordLogs: true,
    displayFilter: (type, event) => {
      // return true to display the event in the terminal, false to hide it
      // `type` is either `console` or `browser`
      // `event` follows the same format as the main event filter
      
      // for example, only display errors in the terminal but record everything:
      if (event.level === 'error' || event.type === 'error') {
        return true
      }
      
      return false
    }
  };
  require('cypress-log-to-output').install(on, filterCallback, options)
}
```
