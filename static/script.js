// static/script.js

// DOMが読み込まれたら初期化処理を実行
document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数 ---
    let totalQuestions = 0; // 総問題数
    let correctAnswers = new Set(); // 正解した問題のIDを格納するSet

    // --- DOM要素の取得 ---
    const questionListDiv = document.getElementById('question-list');
    const quizContainer = document.getElementById('quiz-container');
    const questionText = document.getElementById('question-text');
    const optionsContainer = document.getElementById('options-container');
    const resultMessage = document.getElementById('result-message');
    const clearMessage = document.getElementById('clear-message');

    /**
     * バックエンドに問題の解放状況を問い合わせ、UIを更新する関数
     */
    async function checkStatus() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            // 総問題数を更新
            totalQuestions = data.total_questions;

            // 問題リストのUIを更新
            updateQuestionList(data.unlocked_question, data.total_questions);
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    }

    /**
     * 問題リストの表示を更新する関数
     * @param {number} unlockedCount - 解放済みの問題数
     * @param {number} totalCount - 総問題数
     */
    function updateQuestionList(unlockedCount, totalCount) {
        // 問題リストを一旦空にする
        questionListDiv.innerHTML = '';

        // 問題数分ループしてボタンを生成
        for (let i = 1; i <= totalCount; i++) {
            const button = document.createElement('button');
            button.classList.add('question-btn');
            
            if (i <= unlockedCount) {
                // 解放済みの問題
                button.textContent = `第${i}問`;
                button.onclick = () => loadQuestion(i);
                // 正解済みの場合はスタイルを適用
                if (correctAnswers.has(i)) {
                    button.classList.add('answered');
                }
            } else {
                // 未解放の問題
                button.textContent = `第${i}問 (ロック中)`;
                button.classList.add('locked');
                button.disabled = true;
            }
            questionListDiv.appendChild(button);
        }
    }

    /**
     * 指定されたIDの問題をサーバーから取得して表示する関数
     * @param {number} q_id - 問題ID
     */
    async function loadQuestion(q_id) {
        // 既に正解済みの問題は再挑戦できないようにする
        if (correctAnswers.has(q_id)) {
            resultMessage.textContent = 'この問題はすでに正解済みです。';
            resultMessage.className = '';
            quizContainer.classList.remove('hidden');
            optionsContainer.innerHTML = '';
            questionText.textContent = `第${q_id}問`;
            return;
        }

        try {
            const response = await fetch(`/api/question/${q_id}`);
            if (!response.ok) throw new Error('Failed to load question.');
            
            const data = await response.json();
            
            // 問題文と選択肢を表示
            questionText.textContent = `第${q_id}問: ${data.question}`;
            optionsContainer.innerHTML = ''; // 選択肢をクリア
            resultMessage.textContent = ''; // 結果メッセージをクリア

            data.options.forEach(option => {
                const button = document.createElement('button');
                button.textContent = option;
                button.classList.add('option-btn');
                button.onclick = () => submitAnswer(q_id, option);
                optionsContainer.appendChild(button);
            });

            // クイズコンテナを表示
            quizContainer.classList.remove('hidden');
        } catch (error) {
            console.error(`Error loading question ${q_id}:`, error);
        }
    }

    /**
     * ユーザーの回答をサーバーに送信し、結果を表示する関数
     * @param {number} q_id - 問題ID
     * @param {string} answer - ユーザーが選択した回答
     */
    async function submitAnswer(q_id, answer) {
        try {
            const response = await fetch('/api/answer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ q_id: q_id, answer: answer }),
            });
            const data = await response.json();

            // 選択肢ボタンを無効化して再回答を防ぐ
            document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);

            if (data.correct) {
                resultMessage.textContent = '正解！ 🎉';
                resultMessage.className = 'correct';
                correctAnswers.add(q_id); // 正解した問題IDを記録
            } else {
                resultMessage.textContent = '不正解... 再挑戦してみてください。';
                resultMessage.className = 'incorrect';
                // 不正解の場合は少し待ってから選択肢を再度有効にする
                setTimeout(() => {
                    document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false);
                    resultMessage.textContent = '';
                }, 2000);
            }

            // 全問クリアしたかチェック
            checkClearCondition();
            // 問題リストのボタンの色を更新
            checkStatus();

        } catch (error) {
            console.error('Error submitting answer:', error);
        }
    }

    /**
     * 全問正解したかどうかを判定し、メッセージを表示する関数
     */
    function checkClearCondition() {
        if (totalQuestions > 0 && correctAnswers.size === totalQuestions) {
            quizContainer.classList.add('hidden');
            clearMessage.classList.remove('hidden');
        }
    }


    // --- 初期化処理 ---

    // 最初にステータスを確認
    checkStatus();

    // 5秒ごとに問題の解放状況をポーリング（自動更新）
    setInterval(checkStatus, 5000);
});