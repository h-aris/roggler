import { extendTheme } from '@chakra-ui/react'

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  colors: {
    poe: {
      primary: '#4a9eff',
      secondary: '#2a2a2a',
      dark: '#0a0a0a',
      darker: '#1a1a1a',
    }
  },
  styles: {
    global: {
      body: {
        bg: 'gray.900',
        color: 'white',
      },
    },
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: 'blue',
      },
    },
    Card: {
      baseStyle: {
        container: {
          bg: 'poe.darker',
          border: '2px solid',
          borderColor: 'poe.secondary',
        },
      },
    },
  },
})

export default theme