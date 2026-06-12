const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.static('public'));

let gameRoom = null; // 이제 방은 딱 하나만 존재합니다.

io.on('connection', (socket) => {
  
  // 1. 호스트가 방을 만들 때
  socket.on('createGame', (config) => {
    gameRoom = { 
      hostId: socket.id, 
      players: [],
      questions: config.questions, 
      maxTeams: config.teams,      
      currentState: 'LOBBY',
      currentQIndex: -1      
    };
    
    socket.join('MAIN_ROOM');
    socket.emit('gameCreated'); // 코드 번호를 보낼 필요가 없음
    console.log(`게임이 설정되었습니다. 문제 수: ${config.questions.length}개`);
  });

  // 2. 참가자가 접속할 때
  socket.on('joinGame', (data) => {
    const { team, name } = data;
    if (gameRoom) {
      socket.join('MAIN_ROOM');
      gameRoom.players.push({ id: socket.id, team, name, answer: "" }); 
      socket.emit('joinSuccess');
      io.to(gameRoom.hostId).emit('playerJoined', `${team}조 ${name}`);
    }
  });

  // 3. 호스트가 다음 단계로 넘길 때
  socket.on('nextState', () => {
    if (!gameRoom) return;

    if (gameRoom.currentState === 'LOBBY' || gameRoom.currentState === 'RESULT') {
      gameRoom.currentState = 'Q_NUM'; 
      gameRoom.currentQIndex++;        
      gameRoom.players.forEach(p => p.answer = ""); 
      
    } else if (gameRoom.currentState === 'Q_NUM') {
      gameRoom.currentState = 'Q_TEXT'; 
    } else if (gameRoom.currentState === 'Q_TEXT') {
      gameRoom.currentState = 'RESULT'; 
    }

    io.to(gameRoom.hostId).emit('updateHostScreen', {
      state: gameRoom.currentState,
      qIndex: gameRoom.currentQIndex,
      questionText: gameRoom.questions[gameRoom.currentQIndex],
      players: gameRoom.players
    });

    io.to('MAIN_ROOM').emit('updatePlayerScreen', {
      state: gameRoom.currentState
    });
  });

  // 4. 참가자가 답안을 제출할 때
  socket.on('submitAnswer', (answer) => {
    if (gameRoom) {
      const player = gameRoom.players.find(p => p.id === socket.id);
      if (player) {
        player.answer = answer;
      }
    }
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log('게임 서버가 가동되었습니다.');
});