// static/script.js

document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数 ---
    let totalQuestions = 0; // 総問題数 (これは引き続き表示用として保持)
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

            // ★ ここでの `unlocked_question` は「公開中の問題数」を意味する
            updateQuestionList(data.unlocked_question, data.total_questions);
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    }

    /**
     * 問題リストの表示を更新する関数
     * @param {number} publicCount - 公開済みの問題数（実際には使用せず、status APIから直接問題を全て取得するように変更）
     * @param {number} totalCount - 総問題数
     */
    async function updateQuestionList(publicCount, totalCount) { // publicCount はここでは未使用だが引数は残す
        questionListDiv.innerHTML = '';

        try {
            // ★ 全ての問題データを取得し、is_publicに基づいて表示を制御する
            const allQuestionsResponse = await fetch('/api/status/all_questions'); // 新しいAPIエンドポイントを想定
            if (!allQuestionsResponse.ok) throw new Error('Failed to fetch all questions.');
            const allQuestionsData = await allQuestionsResponse.json();
            const questions = allQuestionsData.questions;

            // ID順にソート（必要であれば）
            questions.sort((a, b) => a.id - b.id);

            questions.forEach(q => {
                const button = document.createElement('button');
                button.classList.add('question-btn');
                
                if (q.is_public) { // ★ is_publicプロパティに基づいて判断
                    button.textContent = `第${q.id}問`;
                    button.onclick = () => loadQuestion(q.id);
                    // 正解済みの場合はスタイルを適用
                    if (correctAnswers.has(q.id)) {
                        button.classList.add('answered');
                    }
                } else {
                    button.textContent = `第${q.id}問 (非公開)`; // ★ ロック中から非公開に変更
                    button.classList.add('locked');
                    button.disabled = true;
                }
                questionListDiv.appendChild(button);
            });
        } catch (error) {
            console.error('Error updating question list:', error);
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
            const existingImage = document.getElementById('quiz-image');
            if (existingImage) {
                existingImage.remove();
            }
            questionText.textContent = `第${q_id}問`;
            return;
        }

        try {
            const response = await fetch(`/api/question/${q_id}`);
            if (!response.ok) {
                const errorData = await response.json();
                console.error(`Error loading question ${q_id}:`, errorData.error);
                resultMessage.textContent = errorData.error; // エラーメッセージを表示
                resultMessage.className = 'incorrect';
                quizContainer.classList.remove('hidden'); // エラーを表示するためにコンテナを表示
                optionsContainer.innerHTML = ''; // 選択肢はクリア
                questionText.textContent = `第${q_id}問`; // 問題番号のみ
                // 以前の画像があれば削除する
                const existingImage = document.getElementById('quiz-image');
                if (existingImage) {
                    existingImage.remove();
                }
                return; // エラーなのでここで処理を終了
            }
            
            const data = await response.json();

            const existingImage = document.getElementById('quiz-image');
            if (existingImage) {
                existingImage.remove();
            }

            if (data.image) {
                const img = document.createElement('img');
                img.src = `/static/images/${data.image}`;
                img.id = 'quiz-image';
                questionText.before(img); 
            }
            
            questionText.textContent = `第${q_id}問: ${data.question}`;
            optionsContainer.innerHTML = '';
            resultMessage.textContent = '';

            data.options.forEach(option => {
                const button = document.createElement('button');
                button.textContent = option;
                button.classList.add('option-btn');
                button.onclick = () => submitAnswer(q_id, option);
                optionsContainer.appendChild(button);
            });

            quizContainer.classList.remove('hidden');
        } catch (error) {
            console.error(`Error loading question ${q_id}:`, error);
            resultMessage.textContent = '問題の読み込み中にエラーが発生しました。';
            resultMessage.className = 'incorrect';
            quizContainer.classList.remove('hidden');
            optionsContainer.innerHTML = '';
            questionText.textContent = `第${q_id}問`;
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

            document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = true);

            if (data.correct) {
                resultMessage.textContent = '正解！ 🎉';
                resultMessage.className = 'correct';
                correctAnswers.add(q_id);
            } else {
                resultMessage.textContent = '不正解... 再挑戦してみてください。';
                resultMessage.className = 'incorrect';
                setTimeout(() => {
                    document.querySelectorAll('.option-btn').forEach(btn => btn.disabled = false);
                    resultMessage.textContent = '';
                }, 2000);
            }

            // 全問クリアしたかチェック (totalQuestionsは公開中の問題数で再計算が必要)
            checkClearCondition();
            checkStatus(); // 問題リストのボタンの色を更新
        } catch (error) {
            console.error('Error submitting answer:', error);
            resultMessage.textContent = '回答の送信中にエラーが発生しました。';
            resultMessage.className = 'incorrect';
        }
    }

    /**
     * 全問正解したかどうかを判定し、メッセージを表示する関数
     */
    async function checkClearCondition() {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            const currentPublicCount = data.unlocked_question; // 現在公開中の問題数
            
            // 正解した問題数が、現在公開中の問題数と一致すればクリア
            if (currentPublicCount > 0 && correctAnswers.size === currentPublicCount) {
                quizContainer.classList.add('hidden');
                clearMessage.classList.remove('hidden');
            } else {
                clearMessage.classList.add('hidden'); // 全問クリアしていない場合は非表示
            }
        } catch (error) {
            console.error('Error checking clear condition:', error);
        }
    }


    // --- 初期化処理 ---

    // 最初にステータスを確認
    checkStatus();

    // 5秒ごとに問題の解放状況をポーリング（自動更新）
    setInterval(checkStatus, 5000);
});